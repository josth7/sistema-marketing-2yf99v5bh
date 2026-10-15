import { useCallback, useEffect, useState } from 'react'
import {
  Inbox,
  FileText,
  Check,
  RefreshCw,
  AlertCircle,
  Inbox as InboxIcon,
  LogIn,
} from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { listarCaixa, marcarLida, type ItemCaixa } from '@/lib/marketing/caixa'
import { CabecalhoPagina } from '@/components/base/estados'

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

      {erro && (
        <div className="mb-4 flex items-start gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-3 text-sm text-destructive">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <div>
            <p className="font-medium">Algo deu errado</p>
            <p>{erro}</p>
            <button onClick={() => void carregar()} className="mt-1 underline font-medium">
              Tentar novamente
            </button>
          </div>
        </div>
      )}

      {carregando ? (
        <div className="rounded-lg border border-border bg-white p-8 text-center text-sm text-muted-foreground">
          Carregando…
        </div>
      ) : itens.length === 0 ? (
        <div className="rounded-lg border border-border bg-white p-8 text-center">
          <InboxIcon className="mx-auto h-10 w-10 text-muted-foreground/40" />
          <p className="mt-2 font-medium">Nenhum relatório recebido ainda</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Os relatórios aparecem aqui quando o envio automático for ativado
          </p>
        </div>
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
                  <p className="mt-1 font-medium truncate">{rotuloQuinzena(item)}</p>
                  {item.relatorio && item.relatorio.report_revision > 1 && (
                    <p className="text-xs text-muted-foreground">
                      Revisão {item.relatorio.report_revision} (republicado)
                    </p>
                  )}
                </div>
                <div className="flex gap-2 shrink-0">
                  <button
                    onClick={() => void abrirRelatorio(item)}
                    className="flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
                  >
                    <FileText className="h-4 w-4" />
                    Ver relatório
                  </button>
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
            <pre className="whitespace-pre-wrap break-words text-sm text-gray-800">
              {JSON.stringify(aberto.dados, null, 2)}
            </pre>
          </div>
        </div>
      )}
    </div>
  )
}
