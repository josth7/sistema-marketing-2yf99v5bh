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
import { tickTeste } from '@/lib/marketing/caixa'
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
  const [repAberto, setRepAberto] = useState<string | null>(null)
  const [repMotivo, setRepMotivo] = useState('')
  const [repChave, setRepChave] = useState('')
  const [repEnviando, setRepEnviando] = useState(false)
  const [repErro, setRepErro] = useState<string | null>(null)
  const [repResultado, setRepResultado] = useState<string | null>(null)
  const [tickRodando, setTickRodando] = useState(false)
  const [tickResultado, setTickResultado] = useState<string | null>(null)

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

  // ---- republicação administrativa (SPEC-2-004: motivo + idempotência) ----
  const abrirRepublicar = (id: string) => {
    setRepAberto(id)
    setRepMotivo('')
    setRepChave('rep-' + id + '-' + Date.now().toString(36))
    setRepErro(null)
    setRepResultado(null)
  }

  const confirmarRepublicar = async () => {
    if (!repAberto) return
    setRepEnviando(true)
    setRepErro(null)
    setRepResultado(null)
    try {
      const r = (await pb.send(`/backend/v1/reports/${repAberto}/republish`, {
        method: 'POST',
        body: { revision_reason: repMotivo, idempotency_key: repChave },
      })) as { id?: string; report_revision?: number; replay?: boolean; aviso?: string }
      setRepResultado(
        r.replay
          ? 'Replay: a MESMA revisão ' +
              (r.report_revision ?? '') +
              ' foi devolvida (nada duplicado)'
          : 'Revisão ' +
              (r.report_revision ?? '') +
              ' criada e entregue na caixa dos destinatários atuais',
      )
      await carregar()
    } catch (e) {
      setRepErro(lerErro(e).erro)
    } finally {
      setRepEnviando(false)
    }
  }

  // ---- job automático com relógio de teste (SPEC-2-004: prova sem esperar o cron) ----
  const rodarJobAgora = async () => {
    setTickRodando(true)
    setTickResultado(null)
    try {
      const r = (await tickTeste()) as {
        tick?: {
          hojeRef?: string
          snapshots_criados?: number
          itens_criados?: number
          avisos?: string[]
        }
      }
      const t = r.tick || {}
      setTickResultado(
        'Job executado (relógio ' +
          (t.hojeRef ?? 'hoje') +
          '): ' +
          (t.snapshots_criados ?? 0) +
          ' relatório(s) gerado(s), ' +
          (t.itens_criados ?? 0) +
          ' entrega(s) na caixa' +
          (t.avisos && t.avisos.length > 0 ? ' · avisos: ' + t.avisos.join(' | ') : ''),
      )
      await carregar()
    } catch (e) {
      setTickResultado(lerErro(e).erro)
    } finally {
      setTickRodando(false)
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

      <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-900">
        <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
        <span>
          Envio automático: <strong>DESATIVADO</strong> — aguarda confirmação do calendário e dos
          destinatários pelo dono. Provas do job automático usam política de teste (fixture).
        </span>
        <button
          onClick={() => void rodarJobAgora()}
          disabled={tickRodando}
          className="ml-auto shrink-0 rounded-md border border-amber-300 bg-white px-3 py-1.5 text-xs font-medium text-amber-900 hover:bg-amber-50 disabled:opacity-60"
        >
          {tickRodando ? 'Rodando…' : 'Rodar job agora (teste)'}
        </button>
      </div>

      {tickResultado && (
        <p className="rounded-lg border border-border bg-white px-4 py-2 text-sm">
          {tickResultado}
        </p>
      )}

      {user && (
        <div className="flex items-center justify-between rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm">
          <span>
            Conectado como <strong>{user.email}</strong>
          </span>
          <Button size="sm" variant="ghost" onClick={sair}>
            Sair
          </Button>
        </div>
      )}
      {!user && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Entrar para gerar e ver relatórios</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="email">E-mail do usuário de teste</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="criterios.fixture.criador@haisan.com.br"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="senha">Senha</Label>
              <Input
                id="senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="Fixture@2026"
              />
            </div>
            {erroAuth && <p className="text-sm text-destructive">{erroAuth}</p>}
            <Button onClick={() => void entrar()} disabled={entrando || !email || !senha}>
              {entrando ? 'Entrando…' : 'Entrar'}
            </Button>
          </CardContent>
        </Card>
      )}

      {user && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Gerar relatório de uma quinzena fechada</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="periodo">Quinzena</Label>
              <Select value={periodo} onValueChange={setPeriodo}>
                <SelectTrigger id="periodo" className="w-full sm:w-80">
                  <SelectValue placeholder="Escolha a quinzena" />
                </SelectTrigger>
                <SelectContent>
                  {quinzenasFechadas().map((q) => (
                    <SelectItem key={q.value} value={q.value}>
                      {q.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {errosCampo['period_start'] && (
                <p className="text-sm text-destructive">{errosCampo['period_start']}</p>
              )}
            </div>
            <Button onClick={() => void gerar()} disabled={gerando || !periodo}>
              {gerando ? 'Gerando…' : 'Gerar relatório'}
            </Button>
            {aviso && <p className="text-sm text-[#374151]">{aviso}</p>}
          </CardContent>
        </Card>
      )}

      {user && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Relatórios gerados</CardTitle>
          </CardHeader>
          <CardContent>
            {carregando ? (
              <p className="text-sm text-[#6B7280]">Carregando…</p>
            ) : itens.length === 0 ? (
              <p className="text-sm text-[#6B7280]">
                Nenhum relatório gerado ainda — escolha uma quinzena fechada e gere.
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
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => abrir(it.id)}
                        disabled={aberto === it.id}
                      >
                        {aberto === it.id ? 'Abrindo…' : 'Ver prévia'}
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => abrirRepublicar(it.id)}>
                        Republicar com motivo
                      </Button>
                    </div>
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
                  janelaDias={
                    parseJson<{ janela_dias: number }>(detalhe.coverage_by_source, {
                      janela_dias: 0,
                    }).janela_dias
                  }
                  snapshot={parseSnapshot(detalhe.data_snapshot_json)}
                  eligibility={parseJson<EligibilidadeComparacao>(
                    detalhe.comparison_eligibility,
                    null,
                  )}
                  warnings={parseJson<string[]>(detalhe.warnings, [])}
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
      )}

      {repAberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Republicar relatório"
          onClick={() => setRepAberto(null)}
        >
          <div
            className="w-full max-w-md rounded-lg bg-white p-5 shadow-xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <h2 className="text-lg font-semibold">Republicar relatório</h2>
            <p className="mt-1 text-sm text-[#6B7280]">
              Cria uma revisão nova com os dados atuais e entrega na caixa dos destinatários atuais.
              O snapshot anterior continua intacto. Repetir a MESMA abertura de diálogo devolve a
              MESMA revisão (nada duplicado).
            </p>
            <div className="mt-3 space-y-2">
              <Label htmlFor="rep-motivo">Motivo da republicação (obrigatório)</Label>
              <Input
                id="rep-motivo"
                value={repMotivo}
                onChange={(e) => setRepMotivo(e.target.value)}
                placeholder="Ex.: carga do Google completou a cobertura da quinzena"
              />
              {repErro && <p className="text-sm text-destructive">{repErro}</p>}
              {repResultado && <p className="text-sm text-emerald-700">{repResultado}</p>}
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setRepAberto(null)}>
                Cancelar
              </Button>
              <Button
                onClick={() => void confirmarRepublicar()}
                disabled={repEnviando || !repMotivo.trim()}
              >
                {repEnviando ? 'Republicando…' : 'Republicar'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/** Prévia do template (dados de demonstração ISOLADOS — origem 'demonstracao'). */
function TemplateRelatorio(props: {
  titulo: string
  geradoEm: string
  cobertura: CoberturaCanalItem[] | null
  janelaDias: number
  snapshot: SnapshotRelatorio | null
  eligibility: EligibilidadeComparacao | null
  warnings: string[]
  decisoes: DecisaoRef[]
  avisoAlertas: string
}) {
  const hojeISO = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const snap = props.snapshot ?? fixtureSnapshot()
  const cob = props.cobertura ?? FIXTURE_COBERTURA
  const janela = props.janelaDias || diasJanela('2026-09-01', '2026-09-15')
  const elig = props.eligibility ?? FIXTURE_ELIG
  const warnings = props.warnings.length > 0 ? props.warnings : FIXTURE_WARNINGS
  const decisoes = props.decisoes.length > 0 ? props.decisoes : fixtureDecisoes()
  const payloadDemo = FIXTURE_PAYLOAD

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="text-lg font-semibold">{props.titulo}</h3>
          <p className="text-xs text-[#6B7280]">gerado em {props.geradoEm}</p>
        </div>
        <Badge variant="outline">template 1.0.0</Badge>
      </div>

      <p className="text-sm text-[#374151]">{resumoFactual(snap, cob, janela)}</p>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
            Cobertura por fonte
          </p>
          <div className="mt-2 space-y-1">
            {(cob ?? []).map((c) => (
              <div key={c.canal} className="flex justify-between text-sm">
                <span>{c.canal}</span>
                <span>{c.dias} dia(s)</span>
              </div>
            ))}
          </div>
        </div>
        <div className="rounded-lg border border-gray-200 p-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
            Comparação com a quinzena anterior
          </p>
          {elig && elig.valida ? (
            <div className="mt-2 space-y-1 text-sm">
              {blocoComparativo(snap, null).map((b) => (
                <div key={b.rotulo} className="flex justify-between">
                  <span>{b.rotulo}</span>
                  <span>{b.valor}</span>
                </div>
              ))}
            </div>
          ) : (
            <p className="mt-2 text-sm text-[#374151]">
              Comparação suprimida — {elig?.motivo ?? 'janelas não comparáveis'}
            </p>
          )}
        </div>
      </div>

      {warnings.length > 0 && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
          <p className="flex items-start gap-1 text-xs text-amber-700">
            <AlertTriangle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            {warnings.join(' ')}
          </p>
        </div>
      )}

      <div className="space-y-3">
        <TabelaObjetivos
          titulo="Pago — indicadores por objetivo"
          linhas={snap.pago?.porObjetivo ?? []}
        />
        <TabelaObjetivos
          titulo="Orgânico — indicadores por objetivo"
          linhas={snap.organico?.porObjetivo ?? []}
        />
      </div>

      <div className="rounded-lg border border-gray-200 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">
          Decisões em aberto
        </p>
        <div className="mt-2 space-y-1">
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
      </div>

      <div className="rounded-lg border border-gray-200 p-3">
        <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">Alertas</p>
        <p className="mt-1 text-sm text-[#6B7280]">{props.avisoAlertas}</p>
      </div>

      <p className="text-xs text-[#9CA3AF]">
        Demonstração: payload de teste renderizado como texto — {payloadDemo}
      </p>
    </div>
  )
}

function MiniValor(props: { rotulo: string; valor: string }) {
  return (
    <div className="rounded-lg border border-gray-200 p-3">
      <p className="text-xs text-[#6B7280]">{props.rotulo}</p>
      <p className="text-lg font-semibold">{props.valor}</p>
    </div>
  )
}

function TabelaObjetivos(props: { titulo: string; linhas: Array<Record<string, unknown>> }) {
  if (!props.linhas || props.linhas.length === 0) return null
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-[#6B7280]">{props.titulo}</p>
      <div className="mt-1 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-[#6B7280]">
              <th className="py-1 pr-3">Objetivo</th>
              <th className="py-1 pr-3">Gasto</th>
              <th className="py-1 pr-3">Impressões</th>
              <th className="py-1 pr-3">Cliques</th>
              <th className="py-1">Resultados</th>
              <th className="py-1">Custo por resultado</th>
            </tr>
          </thead>
          <tbody>
            {props.linhas.map((l) => (
              <tr key={String(l.objetivo)} className="border-t border-gray-100">
                <td className="py-1 pr-3 font-medium">{String(l.objetivo)}</td>
                <td className="py-1 pr-3">
                  {l.metricas && typeof l.metricas === 'object' && 'gasto' in l.metricas
                    ? formatarMoeda(Number((l.metricas as Record<string, unknown>).gasto ?? 0))
                    : '—'}
                </td>
                <td className="py-1 pr-3">
                  {l.metricas && typeof l.metricas === 'object' && 'impressoes' in l.metricas
                    ? formatarInteiro(
                        Number((l.metricas as Record<string, unknown>).impressoes ?? 0),
                      )
                    : '—'}
                </td>
                <td className="py-1 pr-3">
                  {l.metricas && typeof l.metricas === 'object' && 'cliques' in l.metricas
                    ? formatarInteiro(Number((l.metricas as Record<string, unknown>).cliques ?? 0))
                    : '—'}
                </td>
                <td className="py-1">
                  {l.metricas && typeof l.metricas === 'object' && 'resultados' in l.metricas
                    ? (l.metricas as Record<string, unknown>).resultados === null
                      ? '—'
                      : formatarInteiro(
                          Number((l.metricas as Record<string, unknown>).resultados ?? 0),
                        )
                    : '—'}
                </td>
                <td className="py-1">
                  {l.metricas && typeof l.metricas === 'object' && 'custoPorResultado' in l.metricas
                    ? (l.metricas as Record<string, unknown>).custoPorResultado === null
                      ? '—'
                      : formatarMoeda(
                          Number((l.metricas as Record<string, unknown>).custoPorResultado ?? 0),
                        )
                    : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
