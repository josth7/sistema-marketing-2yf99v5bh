import { useCallback, useEffect, useState } from 'react'
import { Inbox, FileText, Check, RefreshCw, LogIn } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { listarCaixa, marcarLida, type ItemCaixa } from '@/lib/marketing/caixa'
import {
  CabecalhoPagina,
  EstadoCarregando,
  EstadoErro,
  EstadoVazio,
} from '@/components/base/estados'

/**
 * Caixa de entrada (SPEC-2-004, card a70d5ab8, CA-2-11).
 * Lista dos MEUS relatórios entregues; "Ver relatório" abre o snapshot (mesma
 * prévia de /relatorios); "Marcar como lida" idempotente; estados carregando/
 * vazio/erro; celular em cards.
 *
 * PROVA 13/10: sem sessão a página mostrava "Nenhum relatório recebido ainda"
 * (o erro de auth ficava invisível) — agora exige LOGIN na própria página,
 * igual ao padrão de /criterios; a caixa é POR USUÁRIO (RLS user_id).
 */

function dataBR(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function rotuloQuinzena(item: ItemCaixa): string {
  const r = item.relatorio
  if (!r) return 'Relatório indisponível'
  const partes = r.period_start.split('-')
  const mes = Number(partes[1])
  const meses = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
  const nomeMes = meses[mes - 1] || '?'
  return (
    'Quinzena ' +
    r.quinzena +
    ' de ' +
    nomeMes +
    '/' +
    partes[0] +
    ' (' +
    r.period_start.slice(8, 10) +
    '–' +
    r.period_end.slice(8, 10) +
    ')'
  )
}

export default function Caixa() {
  const [user, setUser] = useState(pb.authStore.isValid ? pb.authStore.record : null)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erroAuth, setErroAuth] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [itens, setItens] = useState<ItemCaixa[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [aberto, setAberto] = useState<{ id: string; dados: Record<string, unknown> } | null>(null)
  const [marcando, setMarcando] = useState('')

  const carregar = useCallback(async () => {
    if (!pb.authStore.isValid) return
    setCarregando(true)
    setErro('')
    try {
      const lista = await listarCaixa()
      setItens(lista)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não foi possível carregar a caixa de entrada')
    } finally {
      setCarregando(false)
    }
  }, [])

  useEffect(() => {
    if (user) void carregar()
  }, [user, carregar])

  const entrar = async () => {
    setEntrando(true)
    setErroAuth('')
    try {
      await pb.collection('users').authWithPassword(email.trim(), senha)
      setUser(pb.authStore.isValid ? pb.authStore.record : null)
      setErro('')
      setItens([])
      await carregar()
    } catch {
      setErroAuth(
        'Login inválido — confira e-mail e senha (conta de teste: criterios.fixture.aprovador@haisan.com.br, senha Fixture@2026)',
      )
    } finally {
      setEntrando(false)
    }
  }

  const sair = () => {
    pb.authStore.clear()
    setUser(null)
    setItens([])
    setErro('')
  }

  async function abrirRelatorio(item: ItemCaixa) {
    try {
      const r = await pb.send('/backend/v1/reports/' + item.report_id, { method: 'GET' })
      const item_ = (r as { item: Record<string, unknown> }).item
      setAberto({ id: item.report_id, dados: item_ })
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não foi possível abrir o relatório')
    }
  }

  async function aoMarcarLida(item: ItemCaixa) {
    setMarcando(item.id)
    try {
      await marcarLida(item.id)
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não foi possível marcar como lida')
    } finally {
      setMarcando('')
    }
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <CabecalhoPagina
          titulo="Caixa de entrada"
          descricao="Relatórios executivos entregues para você"
        />
        <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <LogIn className="h-4 w-4 text-[#6C3EF5]" />
            <p className="font-medium">Entrar para ver sua caixa</p>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            A caixa é individual — cada usuário vê só os relatórios entregues para ele.
          </p>
          <div className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              placeholder="seu email @haisan.com.br"
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-[#6C3EF5]"
            />
            <input
              type="password"
              value={senha}
              onChange={(ev) => setSenha(ev.target.value)}
              placeholder="senha"
              onKeyDown={(ev) => {
                if (ev.key === 'Enter') void entrar()
              }}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-[#6C3EF5]"
            />
            {erroAuth && <p className="text-xs text-red-600">{erroAuth}</p>}
            <button
              onClick={() => void entrar()}
              disabled={entrando || !email || !senha}
              className="w-full rounded-md bg-[#6C3EF5] px-3 py-2 text-sm font-medium text-white hover:bg-[#5b32d4] disabled:opacity-60"
            >
              {entrando ? 'Entrando…' : 'Entrar'}
            </button>
            <p className="text-xs text-muted-foreground">
              Precisa de uma conta? Fale com o administrador do sistema.
            </p>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <CabecalhoPagina
        titulo="Caixa de entrada"
        descricao="Relatórios executivos entregues para você"
        acoes={
          <>
            <button
              onClick={() => void carregar()}
              className="flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
              aria-label="Recarregar caixa de entrada"
            >
              <RefreshCw className="h-4 w-4" />
              Recarregar
            </button>
            <button
              onClick={sair}
              className="rounded-md border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
            >
              Sair
            </button>
          </>
        }
      />

      {user && (
        <div className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
          Logado como <strong>{String(user.email ?? '')}</strong>
        </div>
      )}

      {erro && <EstadoErro mensagem={erro} aoTentar={() => void carregar()} />}

      {carregando ? (
        <EstadoCarregando linhas={2} />
      ) : itens.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum relatório recebido ainda"
          descricao="Os relatórios aparecem aqui quando o envio automático for ativado"
        />
      ) : (
        <div className="space-y-3">
          {itens.map((item) => (
            <div
              key={item.id}
              className={
                'rounded-lg border bg-white p-4 ' +
                (item.read_at ? 'border-border' : 'border-[#6C3EF5]/40')
              }
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    {item.tipo === 'lembrete' && (
                      <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900">
                        Lembrete
                      </span>
                    )}
                    {item.tipo === 'cancelled' && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                        Cancelado
                      </span>
                    )}
                    {!item.read_at && (
                      <span className="rounded-full bg-[#6C3EF5]/10 px-2 py-0.5 text-xs font-semibold text-[#6C3EF5]">
                        Não lido
                      </span>
                    )}
                    {item.read_at && (
                      <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">
                        Lido
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">
                      Entregue em {dataBR(item.delivered_at)}
                    </span>
                  </div>
                  {item.tipo === 'lembrete' || item.tipo === 'cancelled' ? (
                    <>
                      <p className="mt-1 font-medium truncate">
                        {item.decisao
                          ? 'Revisão vencida: ' + item.decisao.title
                          : 'Lembrete de revisão'}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        {item.decisao
                          ? 'Decisão com data de revisão em ' +
                            (item.decisao.review_date ?? '—') +
                            ' — registre a revisão ou reagende em Decisões.'
                          : 'Decisão não encontrada.'}
                      </p>
                    </>
                  ) : (
                    <>
                      <p className="mt-1 font-medium truncate">{rotuloQuinzena(item)}</p>
                      {item.relatorio && item.relatorio.report_revision > 1 && (
                        <p className="text-xs text-muted-foreground">
                          Revisão {item.relatorio.report_revision} (republicado)
                        </p>
                      )}
                    </>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  {(item.tipo === 'lembrete' || item.tipo === 'cancelled') && item.decisao && (
                    <a
                      href="/decisoes"
                      className="flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
                    >
                      <FileText className="h-4 w-4" />
                      Abrir decisão
                    </a>
                  )}
                  {item.tipo !== 'lembrete' && item.tipo !== 'cancelled' && (
                    <button
                      onClick={() => void abrirRelatorio(item)}
                      className="flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
                    >
                      <FileText className="h-4 w-4" />
                      Ver relatório
                    </button>
                  )}
                  {!item.read_at && (
                    <button
                      onClick={() => void aoMarcarLida(item)}
                      disabled={marcando === item.id}
                      className="flex items-center gap-1.5 rounded-md bg-[#6C3EF5] px-3 py-2 text-sm font-medium text-white hover:bg-[#5b32d4] disabled:opacity-60"
                    >
                      <Check className="h-4 w-4" />
                      {marcando === item.id ? 'Marcando…' : 'Marcar como lida'}
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {aberto && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
          role="dialog"
          aria-modal="true"
          aria-label="Prévia do relatório"
          onClick={() => setAberto(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-3xl overflow-auto rounded-lg bg-white p-6 shadow-xl"
            onClick={(ev) => ev.stopPropagation()}
          >
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold">Relatório executivo</h2>
              <button
                onClick={() => setAberto(null)}
                className="rounded-md border border-border px-3 py-1.5 text-sm hover:bg-gray-50"
                aria-label="Fechar prévia"
              >
                Fechar
              </button>
            </div>
            {/* Resumo de IA (SPEC-3-003) — rótulo + registro de revisão */}
            {typeof aberto.dados.resumo_publicado === 'string' &&
              aberto.dados.resumo_publicado.length > 0 && (
                <div className="mb-4 rounded-lg border border-amber-300 bg-amber-50 p-3">
                  <span className="rounded-full bg-amber-200 px-2 py-0.5 text-xs font-semibold text-amber-900">
                    Gerado por IA — validar antes de decidir
                  </span>
                  <p className="mt-2 whitespace-pre-wrap text-sm text-gray-900">
                    {aberto.dados.resumo_publicado}
                  </p>
                  {typeof aberto.dados.resumo_revisao_registro === 'string' &&
                    aberto.dados.resumo_revisao_registro.length > 0 && (
                      <p className="mt-2 text-xs text-gray-600">
                        {aberto.dados.resumo_revisao_registro}
                      </p>
                    )}
                </div>
              )}
            {typeof aberto.dados.resumo_revisao_registro === 'string' &&
              aberto.dados.resumo_revisao_registro.length > 0 &&
              !(
                typeof aberto.dados.resumo_publicado === 'string' &&
                aberto.dados.resumo_publicado.length > 0
              ) && (
                <p className="mb-4 rounded-lg border border-gray-200 bg-gray-50 p-3 text-xs text-gray-700">
                  {aberto.dados.resumo_revisao_registro}
                </p>
              )}
            {/* Tabela por objetivo — pago (snapshot real), em vez de JSON cru */}
            {(() => {
              const d = aberto.dados
              const ini = String(d.period_start ?? '').slice(8, 10)
              const fim = String(d.period_end ?? '').slice(8, 10)
              const ps = String(d.period_start ?? '')
              const pe = String(d.period_end ?? '')
              const mesNum = Number(ps.slice(5, 7))
              const meses = [
                'jan',
                'fev',
                'mar',
                'abr',
                'mai',
                'jun',
                'jul',
                'ago',
                'set',
                'out',
                'nov',
                'dez',
              ]
              const titulo =
                'Quinzena ' +
                (Number(d.quinzena) === 2 ? '2ª' : '1ª') +
                ' de ' +
                (meses[mesNum - 1] || '?') +
                '/' +
                ps.slice(0, 4) +
                ' (' +
                ini +
                '–' +
                fim +
                ')'
              let pago: Record<string, unknown> = {}
              try {
                const snap =
                  typeof d.data_snapshot_json === 'string'
                    ? JSON.parse(d.data_snapshot_json)
                    : d.data_snapshot_json
                pago = (snap as Record<string, unknown>)?.pago ?? {}
              } catch {
                pago = {}
              }
              const grupos = (pago.porObjetivo ?? pago.objetivos ?? []) as Array<
                Record<string, unknown>
              >
              const fmtBRL = (v: unknown) =>
                typeof v === 'number' && Number.isFinite(v)
                  ? v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
                  : '—'
              const fmtInt = (v: unknown) =>
                typeof v === 'number' && Number.isFinite(v) ? v.toLocaleString('pt-BR') : '—'
              const fmtNum = (v: unknown, casas = 2) =>
                typeof v === 'number' && Number.isFinite(v)
                  ? v.toLocaleString('pt-BR', { maximumFractionDigits: casas })
                  : '—'
              return (
                <div>
                  <h3 className="mb-2 text-base font-semibold">{titulo}</h3>
                  {grupos.length === 0 ? (
                    <p className="text-sm text-gray-600">
                      Sem indicadores no snapshot deste relatório.
                    </p>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead>
                          <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                            <th className="py-2 pr-3">Objetivo</th>
                            <th className="py-2 pr-3">Gasto</th>
                            <th className="py-2 pr-3">Impressões</th>
                            <th className="py-2 pr-3">Cliques</th>
                            <th className="py-2 pr-3">Resultados</th>
                            <th className="py-2">Custo/result.</th>
                          </tr>
                        </thead>
                        <tbody>
                          {grupos.map((g, i) => {
                            const m = (g.metricas ?? {}) as Record<string, unknown>
                            return (
                              <tr key={i} className="border-b last:border-0">
                                <td className="py-2 pr-3 font-medium">
                                  {String(g.objetivo ?? '—')}
                                </td>
                                <td className="py-2 pr-3">{fmtBRL(m.gasto)}</td>
                                <td className="py-2 pr-3">{fmtInt(m.impressoes)}</td>
                                <td className="py-2 pr-3">{fmtInt(m.cliques)}</td>
                                <td className="py-2 pr-3">
                                  {m.resultados === null || m.resultados === undefined
                                    ? '—'
                                    : fmtInt(m.resultados)}
                                </td>
                                <td className="py-2">
                                  {m.custoPorResultado === null || m.custoPorResultado === undefined
                                    ? '—'
                                    : fmtBRL(m.custoPorResultado)}
                                </td>
                              </tr>
                            )
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                  {/* Separação por canal (Meta × Google) — SPEC-3-004 binário 1 */}
                  {(() => {
                    const porCanal =
                      (grupos.length > 0
                        ? (pago as { porCanal?: Array<Record<string, unknown>> }).porCanal
                        : undefined) ?? []
                    if (porCanal.length === 0) return null
                    const nomeCanal = (c: string) =>
                      c === 'meta_ads'
                        ? 'Meta (Facebook/Instagram)'
                        : c === 'google_ads'
                          ? 'Google Ads'
                          : c
                    return (
                      <div className="mt-4">
                        <h4 className="mb-2 text-sm font-semibold text-gray-800">Por canal</h4>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-left text-xs uppercase tracking-wide text-gray-500">
                                <th className="py-2 pr-3">Canal</th>
                                <th className="py-2 pr-3">Gasto</th>
                                <th className="py-2 pr-3">Impressões</th>
                                <th className="py-2 pr-3">Cliques</th>
                                <th className="py-2">CPC</th>
                              </tr>
                            </thead>
                            <tbody>
                              {porCanal.map((c, i) => {
                                const m = (c.metricas ?? {}) as Record<string, unknown>
                                return (
                                  <tr key={i} className="border-b last:border-0">
                                    <td className="py-2 pr-3 font-medium">
                                      {nomeCanal(String(c.canal ?? '—'))}
                                    </td>
                                    <td className="py-2 pr-3">{fmtBRL(m.gasto)}</td>
                                    <td className="py-2 pr-3">{fmtInt(m.impressoes)}</td>
                                    <td className="py-2 pr-3">{fmtInt(m.cliques)}</td>
                                    <td className="py-2">{fmtBRL(m.cpc)}</td>
                                  </tr>
                                )
                              })}
                            </tbody>
                          </table>
                        </div>
                      </div>
                    )
                  })()}
                  {/* cobertura */}
                  {(() => {
                    let cov: {
                      janela_dias?: number
                      canais?: Array<{ canal: string; dias: number }>
                    } = {}
                    try {
                      const c = d.coverage_by_source
                      cov = typeof c === 'string' ? JSON.parse(c) : (c ?? {})
                    } catch {
                      cov = {}
                    }
                    const canais = cov.canais ?? []
                    if (canais.length === 0) return null
                    return (
                      <p className="mt-3 text-xs text-gray-600">
                        Cobertura:{' '}
                        {canais
                          .map(
                            (c) =>
                              c.canal + ' ' + c.dias + '/' + (cov.janela_dias ?? '—') + ' dias',
                          )
                          .join(' · ')}
                      </p>
                    )
                  })()}
                  {/* warnings */}
                  {(() => {
                    let w: string[] = []
                    try {
                      const ww = d.warnings
                      w = typeof ww === 'string' ? JSON.parse(ww) : (ww ?? [])
                    } catch {
                      w = []
                    }
                    if (w.length === 0) return null
                    return <p className="mt-1 text-xs text-amber-700">⚠ {w.join(' · ')}</p>
                  })()}
                </div>
              )
            })()}
          </div>
        </div>
      )}
    </div>
  )
}
