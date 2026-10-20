import { useCallback, useEffect, useState } from 'react'
import { Activity, LogIn, RefreshCw, ShieldCheck, ShieldAlert } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import { CabecalhoPagina, EstadoCarregando, EstadoErro } from '@/components/base/estados'

/**
 * Saúde do canal Maestro↔sistema (SPEC-3-001, card 6b8c8de9, CA-3-01).
 * Mostra o estado vivo do canal de análise: segredo configurado, recusas 401
 * (total e últimas 24h), ciclos sem consumo e último consumo. Leitura via rota
 * autenticada /backend/v1/analises/canal-estado (a coleção canal_estado não tem
 * API direta — regras nulas). Sem ação em campanhas; somente leitura.
 */

interface CanalEstado {
  ultimo_consumo_em: string | null
  ciclos_sem_consumo: number
  recusas_401_total: number
  recusas_401_ultimas_24h: number
  segredo_configurado: boolean
  atualizado_em: string | null
}

function dataBR(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function Cartao(props: {
  titulo: string
  valor: string
  detalhe?: string
  destaque?: 'ok' | 'atencao'
}) {
  const borda =
    props.destaque === 'ok'
      ? 'border-emerald-200 bg-emerald-50'
      : props.destaque === 'atencao'
        ? 'border-amber-300 bg-amber-50'
        : 'border-border bg-white'
  return (
    <div className={'rounded-lg border p-4 ' + borda}>
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {props.titulo}
      </p>
      <p className="mt-1 text-2xl font-bold tabular-nums text-foreground">{props.valor}</p>
      {props.detalhe && <p className="mt-1 text-xs text-muted-foreground">{props.detalhe}</p>}
    </div>
  )
}

export default function Saude() {
  const [user, setUser] = useState(pb.authStore.isValid ? pb.authStore.record : null)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erroAuth, setErroAuth] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [canal, setCanal] = useState<CanalEstado | null>(null)
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')

  const carregar = useCallback(async () => {
    if (!pb.authStore.isValid) return
    setCarregando(true)
    setErro('')
    try {
      const res = await pb.send<CanalEstado>('/backend/v1/analises/canal-estado', { method: 'GET' })
      setCanal(res && res.ok !== false ? res : null)
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não foi possível carregar o estado do canal')
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
      await carregar()
    } catch {
      setErroAuth('Login inválido — confira e-mail e senha.')
    } finally {
      setEntrando(false)
    }
  }

  const sair = () => {
    pb.authStore.clear()
    setUser(null)
    setCanal(null)
    setErro('')
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <CabecalhoPagina
          titulo="Saúde do canal"
          descricao="Estado vivo do canal de análise entre o agente de IA e o sistema"
        />
        <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <LogIn className="h-4 w-4 text-[#6C3EF5]" />
            <p className="font-medium">Entrar para ver o estado do canal</p>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Mostra se o canal está configurado, quantas tentativas foram recusadas e há quanto tempo
            o agente de IA não consome eventos.
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

  const segredoOk = canal?.segredo_configurado === true
  const ciclos = canal ? Number(canal.ciclos_sem_consumo ?? 0) : 0

  return (
    <div className="mx-auto max-w-5xl px-4 py-8">
      <CabecalhoPagina
        titulo="Saúde do canal"
        descricao="Estado vivo do canal assinado entre o agente de IA (Maestro) e o sistema — recusas, consumo e segredo"
        acoes={
          <>
            <button
              onClick={() => void carregar()}
              disabled={carregando}
              className="flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
              aria-label="Recarregar estado do canal"
            >
              <RefreshCw className={'h-4 w-4' + (carregando ? ' animate-spin' : '')} />
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

      <div className="mt-4 mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
        Logado como <strong>{String(user.email ?? '')}</strong>
      </div>

      {erro && <EstadoErro mensagem={erro} aoTentar={() => void carregar()} />}
      {carregando && !canal && <EstadoCarregando linhas={3} />}

      {!carregando && canal && (
        <>
          <div
            className={
              'mb-4 flex items-center gap-2 rounded-lg border px-4 py-3 text-sm ' +
              (segredoOk
                ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                : 'border-amber-300 bg-amber-50 text-amber-900')
            }
            role="status"
          >
            {segredoOk ? (
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
            ) : (
              <ShieldAlert className="h-4 w-4" aria-hidden="true" />
            )}
            {segredoOk
              ? 'Canal configurado — o segredo da assinatura está ativo.'
              : 'Segredo ausente — o canal está indisponível (toda chamada do agente é recusada).'}
          </div>

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <Cartao
              titulo="Segredo"
              valor={segredoOk ? 'Ativo' : 'Ausente'}
              destaque={segredoOk ? 'ok' : 'atencao'}
              detalhe="Assinatura HMAC das chamadas do agente"
            />
            <Cartao
              titulo="Recusas (24h)"
              valor={String(Number(canal.recusas_401_ultimas_24h ?? 0))}
              destaque={Number(canal.recusas_401_ultimas_24h ?? 0) > 0 ? 'atencao' : undefined}
              detalhe={'Total acumulado: ' + String(Number(canal.recusas_401_total ?? 0))}
            />
            <Cartao
              titulo="Ciclos sem consumo"
              valor={String(ciclos)}
              destaque={ciclos >= 3 ? 'atencao' : ciclos === 0 ? 'ok' : undefined}
              detalhe={
                ciclos >= 3
                  ? '3+ ciclos sem o agente puxar eventos — verificar o canal'
                  : 'Cada ciclo é uma execução do job diário'
              }
            />
            <Cartao
              titulo="Último consumo"
              valor={dataBR(canal.ultimo_consumo_em)}
              detalhe={'Estado atualizado em ' + dataBR(canal.atualizado_em)}
            />
          </div>

          <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
            <Activity className="h-3.5 w-3.5" aria-hidden="true" />
            Recusas 401 contam tentativas com assinatura inválida, timestamp fora da janela de 5
            minutos ou segredo ausente — não são falhas do sistema.
          </p>
        </>
      )}
    </div>
  )
}
