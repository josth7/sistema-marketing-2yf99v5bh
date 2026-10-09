/**
 * Página de Relatórios (SPEC-2-004, card 3b491438, CA-2-10).
 *
 * Relatório executivo de quinzena fechada — factual, sem IA. Neste card:
 * geração MANUAL autenticada (draft persistida), prévia do template com
 * fixture de demonstração (isolada) e lista dos relatórios gerados.
 * NADA é enviado (job/inbox são do card a70d5ab8).
 */
import { useCallback, useEffect, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { AlertTriangle, FileText, FlaskConical, Scale } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { getErrorMessage } from '@/lib/pocketbase/errors'
import {
  blocoComparativo,
  destaqueAtrasada,
  diasJanela,
  fixtureDecisoes,
  fixtureSnapshot,
  parseJson,
  parseSnapshot,
  resumoFactual,
  rotuloQuinzena,
  type CoberturaCanalItem,
  type DecisaoRef,
  type EligibilidadeComparacao,
  type RelatorioDetalhe,
  type RelatorioItem,
  type SnapshotRelatorio,
} from '@/lib/marketing/relatorio'
import { formatarInteiro, formatarMoeda } from '@/lib/marketing/types'

interface ErrosServidor {
  ok: boolean
  erro: string
  campos?: Record<string, unknown>
}

/** Lê o corpo do erro cobrindo SDK v0.26 (corpo em e.response) e validação nativa. */
function lerErro(e: unknown): { erro: string; campos: Record<string, string> } {
  const sdk = e as {
    response?: { data?: ErrosServidor } & ErrosServidor
    data?: ErrosServidor
  }
  const detail = sdk.response?.data ?? sdk.response ?? sdk.data
  const campos: Record<string, string> = {}
  if (detail?.campos && typeof detail.campos === 'object') {
    for (const [campo, det] of Object.entries(detail.campos)) {
      if (det && typeof det === 'object' && 'message' in det)
        campos[campo] = String((det as { message: string }).message)
      else campos[campo] = String(det)
    }
  }
  return { erro: detail?.erro || getErrorMessage(e), campos }
}

/** Quinzenas fechadas disponíveis (últimos 6 meses, só as já terminadas). */
function quinzenasFechadas(): Array<{ value: string; label: string }> {
  const out: Array<{ value: string; label: string }> = []
  const hojeISO = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const agora = new Date(`${hojeISO}T12:00:00Z`)
  for (let m = 0; m < 6; m++) {
    const base = new Date(Date.UTC(agora.getUTCFullYear(), agora.getUTCMonth() - m, 1))
    const ano = base.getUTCFullYear()
    const mes = String(base.getUTCMonth() + 1).padStart(2, '0')
    const ultimo = new Date(Date.UTC(ano, base.getUTCMonth() + 1, 0)).getUTCDate()
    const q1fim = `${ano}-${mes}-15`
    if (q1fim < hojeISO)
      out.push({ value: `${ano}-${mes}-01|${q1fim}`, label: `1ª quinzena (${mes}/${ano}: 01–15)` })
    const q2fim = `${ano}-${mes}-${String(ultimo).padStart(2, '0')}`
    if (q2fim < hojeISO)
      out.push({
        value: `${ano}-${mes}-16|${q2fim}`,
        label: `2ª quinzena (${mes}/${ano}: 16–${String(ultimo).padStart(2, '0')})`,
      })
  }
  return out
}

const FIXTURE_COBERTURA: CoberturaCanalItem[] = [
  { canal: 'meta_ads', dias: 15 },
  { canal: 'google_ads', dias: 9 },
]
const FIXTURE_WARNINGS = [
  'google_ads: 9 dia(s) coberto(s) de 15 — cobertura parcial (indicadores podem subestimar o período)',
]
const FIXTURE_ELIG: EligibilidadeComparacao = {
  valida: false,
  motivo: 'cobertura desigual — google_ads: 9 dia(s) nesta quinzena vs 15 na anterior',
  anterior: { inicio: '2026-09-01', fim: '2026-09-15' },
}
const FIXTURE_PAYLOAD = '<img src=x onerror=alert(1)>'

export default function Relatorios() {
  const [itens, setItens] = useState<RelatorioItem[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [user, setUser] = useState(pb.authStore.isValid ? pb.authStore.record : null)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erroAuth, setErroAuth] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)
  const [periodo, setPeriodo] = useState('')
  const [gerando, setGerando] = useState(false)
  const [aviso, setAviso] = useState<string | null>(null)
  const [errosCampo, setErrosCampo] = useState<Record<string, string>>({})
  const [detalhe, setDetalhe] = useState<RelatorioDetalhe | null>(null)
  const [aberto, setAberto] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!pb.authStore.isValid) {
      setCarregando(false)
      setErro('Entre com um usuário de teste para gerar e ver os relatórios.')
      return
    }
    setCarregando(true)
    setErro(null)
    try {
      const res = (await pb.send('/backend/v1/reports', { method: 'GET' })) as {
        itens?: RelatorioItem[]
      }
      setItens(Array.isArray(res.itens) ? res.itens : [])
    } catch (e) {
      setErro(getErrorMessage(e))
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    if (pb.authStore.isValid) void carregar()
  }, [carregar])

  const entrar = async () => {
    setEntrando(true)
    setErroAuth(null)
    try {
      await pb.collection('users').authWithPassword(email, senha)
      setUser(pb.authStore.isValid ? pb.authStore.record : null)
      setAviso(null)
      await carregar()
    } catch {
      setErroAuth(
        'Login inválido — usuário de teste: criterios.fixture.criador@haisan.com.br, senha Fixture@2026',
      )
    } finally {
      setEntrando(false)
    }
  }

  const sair = () => {
    pb.authStore.clear()
    setUser(null)
    setItens([])
    setDetalhe(null)
    setErro(null)
  }

  const gerar = async () => {
    if (!periodo) {
      setAviso('Escolha a quinzena antes de gerar.')
      return
    }
    const [ini, fim] = periodo.split('|')
    setGerando(true)
    setErrosCampo({})
    setAviso(null)
    try {
      const res = (await pb.send('/backend/v1/reports/generate', {
        method: 'POST',
        body: JSON.stringify({ period_start: ini, period_end: fim }),
      })) as { warnings?: string[]; id?: string }
      setAviso(
        'Relatório gerado e salvo (rascunho) — nada é enviado nesta fase.' +
          (res.warnings && res.warnings.length > 0 ? ` Avisos: ${res.warnings.join(' ')}` : ''),
      )
      await carregar()
    } catch (e) {
      const { erro: msg, campos } = lerErro(e)
      if (Object.keys(campos).length > 0) setErrosCampo(campos)
      setAviso(msg)
    } finally {
      setGerando(false)
    }
  }

  const abrir = async (id: string) => {
    setAberto(id)
    setAviso(null)
    try {
      const res = (await pb.send(`/backend/v1/reports/${id}`, { method: 'GET' })) as {
        item?: RelatorioDetalhe
      }
      setDetalhe(res.item ?? null)
    } catch (e) {
      setAviso(lerErro(e).erro)
      setDetalhe(null)
    } finally {
      setAberto(null)
    }
  }

  const hojeISO = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)

  return (
    <div className="flex-1 p-6 md:p-10 space-y-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-bold tracking-tight">Relatório executivo (prévia)</h1>
        <p className="text-sm text-[#6B7280]">
          Resumo factual da quinzena fechada — sem IA; comparação só quando as janelas são
          comparáveis; nada é enviado nesta fase (envio automático é o próximo card).
        </p>
      </div>

      {user && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm">
          <span>
            Logado como <strong>{String(user.email ?? '')}</strong>
          </span>
          <Button size="sm" variant="ghost" onClick={sair}>
            Sair
          </Button>
        </div>
      )}

      {!user && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Entrar (usuário de teste)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid gap-3 md:grid-cols-2">
              <div className="space-y-1.5">
                <Label>E-mail</Label>
                <Input
                  type="email"
                  value={email}
                  onChange={(ev) => setEmail(ev.target.value)}
                  placeholder="criterios.fixture.criador@haisan.com.br"
                />
              </div>
              <div className="space-y-1.5">
                <Label>Senha</Label>
                <Input
                  type="password"
                  value={senha}
                  onChange={(ev) => setSenha(ev.target.value)}
                  placeholder="Fixture@2026"
                />
              </div>
            </div>
            {erroAuth && <p className="text-xs text-red-600">{erroAuth}</p>}
            <Button onClick={entrar} disabled={entrando}>
              {entrando ? 'Entrando…' : 'Entrar'}
            </Button>
          </CardContent>
        </Card>
      )}

      {aviso && (
        <div className="rounded-lg border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          {aviso}
        </div>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FileText className="h-4 w-4 text-[#6C3EF5]" />
            Gerar relatório da quinzena
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
            <div className="space-y-1.5">
              <Label>Quinzena fechada *</Label>
              <Select value={periodo} onValueChange={setPeriodo}>
                <SelectTrigger>
                  <SelectValue placeholder="escolha a quinzena" />
                </SelectTrigger>
                <SelectContent>
                  {quinzenasFechadas().map((q) => (
                    <SelectItem key={q.value} value={q.value}>
                      {q.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errosCampo.period_start && (
                <p className="text-xs text-red-600">{errosCampo.period_start}</p>
              )}
              {errosCampo.period_end && (
                <p className="text-xs text-red-600">{errosCampo.period_end}</p>
              )}
            </div>
            <Button onClick={gerar} disabled={gerando}>
              {gerando ? 'Gerando…' : 'Gerar relatório'}
            </Button>
          </div>
          <p className="text-xs text-[#6B7280]">
            Só quinzenas já terminadas podem ser geradas — o snapshot fica salvo e imutável.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <FlaskConical className="h-4 w-4 text-[#6C3EF5]" />
            Prévia do template — demonstração (dados fictícios)
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-xs text-[#6B7280] mb-3">
            Formato proposto com fixture isolada — é este formato que você aprova. Nada aqui toca os
            dados reais.
          </p>
          <TemplateRelatorio
            titulo={rotuloQuinzena('2026-10-01', '2026-10-15')}
            geradoEm="— (demonstração)"
            cobertura={FIXTURE_COBERTURA}
            warnings={FIXTURE_WARNINGS}
            eligibility={FIXTURE_ELIG}
            snapshot={fixtureSnapshot()}
            decisoes={fixtureDecisoes()}
            avisoAlertas="nenhuma regra de alerta aprovada ainda — workshop de limiares (22/10)"
          />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Relatórios gerados</CardTitle>
        </CardHeader>
        <CardContent>
          {carregando ? (
            <p className="text-sm text-[#6B7280]">Carregando…</p>
          ) : erro ? (
            <p className="text-sm text-red-600">{erro}</p>
          ) : itens.length === 0 ? (
            <p className="text-sm text-[#6B7280]">
              Nenhum relatório ainda — gere o primeiro com o formulário acima.
            </p>
          ) : (
            <div className="space-y-3">
              {itens.map((it) => (
                <div
                  key={it.id}
                  className="rounded-lg border border-gray-200 bg-white p-4 space-y-2"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="secondary">rascunho</Badge>
                    <span className="text-xs text-[#6B7280]">
                      rev. {it.report_revision} · template {it.template_version}
                    </span>
                    <span className="text-xs text-[#6B7280]">
                      gerado em {String(it.generated_at ?? '').slice(0, 10)}
                    </span>
                  </div>
                  <p className="text-sm font-medium">
                    {rotuloQuinzena(it.period_start, it.period_end)}
                  </p>
                  {parseJson<string[]>(it.warnings, []).length > 0 && (
                    <p className="text-xs text-amber-700 flex items-start gap-1">
                      <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
                      {parseJson<string[]>(it.warnings, []).join(' ')}
                    </p>
                  )}
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => abrir(it.id)}
                    disabled={aberto === it.id}
                  >
                    {aberto === it.id ? 'Abrindo…' : 'Ver prévia'}
                  </Button>
                </div>
              ))}
            </div>
          )}
          {detalhe && (
            <div className="mt-4 border-t pt-4">
              <TemplateRelatorio
                titulo={rotuloQuinzena(detalhe.period_start, detalhe.period_end)}
                geradoEm={String(detalhe.generated_at ?? '').slice(0, 10)}
                cobertura={
                  parseJson<CoberturaCanalItem[]>(detalhe.coverage_by_source, null)?.canais ??
                  parseJson<{ canais: CoberturaCanalItem[] }>(detalhe.coverage_by_source, {
                    canais: [],
                  }).canais
                }
                warnings={parseJson<string[]>(detalhe.warnings, [])}
                eligibility={parseJson<EligibilidadeComparacao>(detalhe.comparison_eligibility, {
                  valida: false,
                  motivo: 'indisponível',
                  anterior: null,
                })}
                snapshot={parseSnapshot(detalhe.data_snapshot_json)}
                decisoes={parseJson<DecisaoRef[]>(detalhe.decision_refs, [])}
                avisoAlertas={
                  parseJson<{ aviso: string }>(detalhe.alert_refs, { aviso: '' }).aviso ||
                  'sem alertas'
                }
              />
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}

/** Template do relatório (compartilhado entre a prévia-demo e o relatório gerado). */
function TemplateRelatorio(props: {
  titulo: string
  geradoEm: string
  cobertura: CoberturaCanalItem[]
  warnings: string[]
  eligibility: EligibilidadeComparacao
  snapshot: SnapshotRelatorio | null
  decisoes: DecisaoRef[]
  avisoAlertas: string
}) {
  const { titulo, geradoEm, cobertura, warnings, eligibility, snapshot, decisoes, avisoAlertas } =
    props
  // hoje local (America/Sao_Paulo = UTC-3) — calculado AQUI (não vem do pai)
  const hojeISO = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const janela = diasJanela(
    titulo.includes('—')
      ? '2026-10-01'
      : (titulo.match(/\((\d{4}-\d{2}-\d{2})/)?.[1] ?? '2026-10-01'),
    titulo.match(/(\d{4}-\d{2}-\d{2})\)/)?.[1] ?? '2026-10-15',
  )
  const pago = snapshot?.pago ?? null
  const organico = snapshot?.organico ?? null
  const compGasto = pago
    ? blocoComparativo({ atual: pago.total.gasto, anterior: null }, eligibility)
    : null

  return (
    <div className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="font-semibold text-base">{titulo}</p>
        <span className="text-xs text-[#6B7280]">gerado em: {geradoEm}</span>
      </div>

      <p className="text-[#374151]">
        {resumoFactual('', '', cobertura, warnings).replace('Período de  a . ', '')}
      </p>

      <div className="flex flex-wrap gap-2">
        {cobertura.length === 0 ? (
          <Badge variant="outline">sem fonte com dados</Badge>
        ) : (
          cobertura.map((c) => (
            <Badge key={c.canal} variant="outline">
              {c.canal}: {c.dias}/{janela} dia(s)
            </Badge>
          ))
        )}
      </div>

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900 space-y-1">
          {warnings.map((w, i) => (
            <p key={i} className="flex items-start gap-1">
              <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
              {w}
            </p>
          ))}
        </div>
      )}

      {pago && (
        <div className="space-y-2">
          <p className="font-medium">Pago (mídia)</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <MiniValor rotulo="Gasto" valor={formatarMoeda(pago.total.gasto)} />
            <MiniValor rotulo="Impressões" valor={formatarInteiro(pago.total.impressoes)} />
            <MiniValor rotulo="Cliques" valor={formatarInteiro(pago.total.cliques)} />
            <MiniValor rotulo="Alcance" valor={formatarInteiro(pago.total.alcance)} />
            <MiniValor
              rotulo="Resultados"
              valor={
                pago.total.resultados === null
                  ? '— (tipos distintos)'
                  : formatarInteiro(pago.total.resultados)
              }
            />
          </div>
          {compGasto && (
            <p className="text-xs text-[#6B7280]">
              Variação do gasto vs quinzena anterior:{' '}
              {compGasto.variacao === null
                ? `indisponível — ${compGasto.motivo}`
                : `${compGasto.variacao > 0 ? '+' : ''}${compGasto.variacao.toFixed(1)}%`}
            </p>
          )}
          <TabelaObjetivos linhas={pago.porObjetivo} />
        </div>
      )}

      {organico && (
        <div className="space-y-2">
          <p className="font-medium">Orgânico</p>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
            <MiniValor rotulo="Alcance" valor={formatarInteiro(organico.total.alcance)} />
            <MiniValor rotulo="Impressões" valor={formatarInteiro(organico.total.impressoes)} />
            <MiniValor rotulo="Cliques" valor={formatarInteiro(organico.total.cliques)} />
            <MiniValor rotulo="Gasto" valor="— (orgânico não tem)" />
            <MiniValor rotulo="Resultados" valor={formatarInteiro(organico.total.resultados)} />
          </div>
          <TabelaObjetivos linhas={organico.porObjetivo} />
        </div>
      )}

      {!pago && !organico && (
        <p className="text-[#6B7280]">
          Sem indicadores nesta quinzena — nenhum dado das fontes (nada é inventado).
        </p>
      )}

      <div className="space-y-2">
        <p className="font-medium">Alertas</p>
        <p className="text-xs text-[#6B7280]">{avisoAlertas}</p>
      </div>

      <div className="space-y-2">
        <p className="font-medium">Decisões em aberto</p>
        {decisoes.length === 0 ? (
          <p className="text-xs text-[#6B7280]">Nenhuma decisão em aberto.</p>
        ) : (
          <div className="space-y-1">
            {decisoes.map((d) => (
              <div key={d.id} className="flex flex-wrap items-center gap-2">
                {d.atrasada && destaqueAtrasada(d.review_date, hojeISO) && (
                  <Badge className="bg-red-100 text-red-800">
                    <Scale className="h-3 w-3 mr-1" />
                    atrasada 2+ ciclos
                  </Badge>
                )}
                <span className={d.atrasada ? 'text-sm' : 'text-sm text-[#6B7280]'}>
                  {d.title} — revisão em {d.review_date ?? '—'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function MiniValor(props: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-gray-200 bg-white px-3 py-2">
      <p className="text-xs text-[#6B7280]">{props.rotulo}</p>
      <p className="text-sm font-medium">{props.valor}</p>
    </div>
  )
}

function TabelaObjetivos(props: {
  linhas: Array<{
    objetivo: string
    registros: number
    motivoCprIndisponivel: string | null
    metricas: {
      alcance: number | null
      impressoes: number | null
      cliques: number | null
      gasto: number | null
      resultados: number | null
      cpc: number | null
      cpm: number | null
      ctr: number | null
      custoPorResultado: number | null
    }
  }>
}) {
  const { linhas } = props
  if (linhas.length === 0)
    return <p className="text-xs text-[#6B7280]">Nenhuma linha por objetivo.</p>
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <thead>
          <tr className="text-left text-[#6B7280]">
            <th className="py-1 pr-3">Objetivo</th>
            <th className="py-1 pr-3">Gasto</th>
            <th className="py-1 pr-3">Impressões</th>
            <th className="py-1 pr-3">Cliques</th>
            <th className="py-1 pr-3">Resultados</th>
            <th className="py-1">Custo por resultado</th>
          </tr>
        </thead>
        <tbody>
          {linhas.map((l) => (
            <tr key={l.objetivo} className="border-t border-gray-100">
              <td className="py-1 pr-3 font-medium">{l.objetivo}</td>
              <td className="py-1 pr-3">{formatarMoeda(l.metricas.gasto)}</td>
              <td className="py-1 pr-3">{formatarInteiro(l.metricas.impressoes)}</td>
              <td className="py-1 pr-3">{formatarInteiro(l.metricas.cliques)}</td>
              <td className="py-1 pr-3">
                {l.metricas.resultados === null ? '—' : formatarInteiro(l.metricas.resultados)}
              </td>
              <td className="py-1">
                {l.metricas.custoPorResultado === null ? (
                  <span title={l.motivoCprIndisponivel ?? undefined}>
                    — {l.motivoCprIndisponivel ? '(sem base)' : ''}
                  </span>
                ) : (
                  formatarMoeda(l.metricas.custoPorResultado)
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
