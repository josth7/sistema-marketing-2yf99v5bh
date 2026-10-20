import { useCallback, useEffect, useState } from 'react'
import { BrainCircuit, LogIn, RefreshCw } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import {
  CabecalhoPagina,
  EstadoCarregando,
  EstadoErro,
  EstadoVazio,
} from '@/components/base/estados'

/**
 * Análises da IA (SPEC-3-001, cards 2e44a45f + "Disparar", CA-3-02/03).
 * Lista em modo leitura, filtrada pelo escopo do grant do leitor (read_analyses
 * é exigido no servidor). Todo item traz o rótulo "Gerado por IA — validar antes
 * de decidir" (REGRA: a IA não decide, só informa com fatos citáveis).
 * Botão "Solicitar análise" (RN-07): cria o evento solicitacao_manual do último
 * período fechado — servidor exige request_analysis, aplica escopo do grant,
 * teto mensal e marca dados parciais com motivo.
 * Sem ação em campanhas; somente leitura.
 */

interface AnaliseItem {
  id: string
  uuid: string
  event_id: string
  tipo: string
  alvo_ref: string
  period_start: string
  period_end: string
  conteudo: string
  evidencias: unknown[]
  modelo: string
  gerado_em: string | null
  origem: string
  estado: string
  versao: number
  fixture: boolean
}

function dataBR(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

const ROTULOS_TIPO: Record<string, string> = {
  diagnostico_periodo: 'Diagnóstico do período',
  parecer_campanha: 'Parecer de campanha',
  parecer_criativo: 'Parecer de criativo',
  resumo_relatorio: 'Resumo do relatório',
}

export default function Analises() {
  const [user, setUser] = useState(pb.authStore.isValid ? pb.authStore.record : null)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erroAuth, setErroAuth] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [itens, setItens] = useState<AnaliseItem[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [pedindo, setPedindo] = useState(false)
  const [avisoPedido, setAvisoPedido] = useState('')

  const carregar = useCallback(async () => {
    if (!pb.authStore.isValid) return
    setCarregando(true)
    setErro('')
    try {
      const res = await fetch(pb.buildURL('/backend/v1/analises'), {
        method: 'GET',
        headers: { Authorization: pb.authStore.token },
      })
      const dados = (await res.json()) as { ok?: boolean; itens?: AnaliseItem[]; erro?: string }
      if (!res.ok || dados.ok === false) {
        throw new Error(dados.erro ?? 'não foi possível carregar as análises')
      }
      setItens(dados.itens ?? [])
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não foi possível carregar as análises')
    } finally {
      setCarregando(false)
    }
  }, [])

  const solicitar = useCallback(async () => {
    if (!pb.authStore.isValid) return
    setPedindo(true)
    setAvisoPedido('')
    try {
      const res = await fetch(pb.buildURL('/backend/v1/analises/eventos'), {
        method: 'POST',
        headers: { Authorization: pb.authStore.token, 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      })
      const dados = (await res.json()) as {
        ok?: boolean
        replay?: boolean
        erro?: string
        detalhe?: string
        evento?: {
          period_start?: string
          period_end?: string
          dados_parciais?: boolean
          motivo_parcial?: string
        }
      }
      if (!res.ok || dados.ok === false) {
        throw new Error(
          dados.detalhe
            ? `${dados.erro ?? 'erro'} (${dados.detalhe})`
            : (dados.erro ?? 'não foi possível pedir a análise'),
        )
      }
      const ev = dados.evento ?? {}
      setAvisoPedido(
        dados.replay
          ? 'Já existe um pedido para este período — nada duplicado.'
          : `Pedido registrado (${ev.period_start ?? ''} → ${ev.period_end ?? ''})${ev.dados_parciais ? ' — dados parciais: ' + (ev.motivo_parcial ?? '') : ''}. O diagnóstico da IA aparece nesta tela quando o agente gravar.`,
      )
      await carregar()
    } catch (e2) {
      setAvisoPedido('Erro: ' + (e2 instanceof Error ? e2.message : 'falha no pedido'))
    } finally {
      setPedindo(false)
    }
  }, [carregar])

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
    setItens([])
    setErro('')
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <CabecalhoPagina
          titulo="Análises"
          descricao="Diagnósticos e pareceres gerados pela IA sobre os períodos fechados"
        />
        <div className="rounded-lg border border-border bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <LogIn className="h-4 w-4 text-[#6C3EF5]" />
            <p className="font-medium">Entrar para ver as análises</p>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            Cada pessoa vê conforme a permissão que recebeu (read_analyses).
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
        titulo="Análises"
        descricao="Diagnósticos e pareceres gerados pela IA sobre períodos fechados — sempre com a evidência citada"
        acoes={
          <>
            <button
              onClick={() => void solicitar()}
              disabled={pedindo}
              className="flex items-center gap-1.5 rounded-md bg-[#6C3EF5] px-3 py-2 text-sm font-medium text-white hover:bg-[#5b32d4] disabled:opacity-60"
            >
              {pedindo ? 'Pedindo…' : 'Solicitar análise'}
            </button>
            <button
              onClick={() => void carregar()}
              disabled={carregando}
              className="flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
              aria-label="Recarregar análises"
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

      {avisoPedido && (
        <div className="mb-3 rounded-lg border border-violet-200 bg-violet-50 px-4 py-2 text-sm text-violet-900">
          {avisoPedido}
        </div>
      )}

      {erro && <EstadoErro mensagem={erro} aoTentar={() => void carregar()} />}

      {carregando && itens.length === 0 ? (
        <EstadoCarregando linhas={3} />
      ) : itens.length === 0 && !erro ? (
        <EstadoVazio
          titulo="Nenhuma análise ainda"
          descricao="Análises aparecem aqui quando o agente de IA grava um diagnóstico ou parecer pelo canal assinado — ou quando você pede uma análise e o agente responde."
        />
      ) : (
        <div className="space-y-3">
          {itens.map((item) => (
            <div key={item.id} className="rounded-lg border border-border bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="rounded-full bg-violet-100 px-2 py-0.5 text-xs font-semibold text-violet-800">
                  Gerado por IA — validar antes de decidir
                </span>
                <span className="text-xs font-medium text-foreground">
                  {ROTULOS_TIPO[item.tipo] ?? item.tipo}
                </span>
                {item.alvo_ref && (
                  <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-700">
                    {item.alvo_ref}
                  </span>
                )}
                {item.fixture && (
                  <span className="rounded-full bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-800">
                    teste
                  </span>
                )}
                <span className="text-xs text-muted-foreground">
                  {item.period_start} → {item.period_end} · {dataBR(item.gerado_em)} · v
                  {item.versao}
                </span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-foreground">{item.conteudo}</p>
              {Array.isArray(item.evidencias) && item.evidencias.length > 0 && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Evidências citadas: {item.evidencias.length}
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
        <BrainCircuit className="h-3.5 w-3.5" aria-hidden="true" />
        A IA grava apenas fatos citáveis dos dados do sistema — não recomenda alteração de campanha,
        orçamento ou criativo. A decisão continua sendo humana.
      </p>
    </div>
  )
}
