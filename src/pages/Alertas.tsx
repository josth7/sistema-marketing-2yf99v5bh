import { useCallback, useEffect, useState } from 'react'
import { BellRing, LogIn, RefreshCw } from 'lucide-react'
import pb from '@/lib/pocketbase/client'
import {
  listarAlertas,
  transicionar,
  rotuloEstadoAlerta,
  type AlertaItem,
} from '@/lib/marketing/alertas'
import {
  CabecalhoPagina,
  EstadoCarregando,
  EstadoErro,
  EstadoVazio,
} from '@/components/base/estados'
import { CabecalhoTela } from '@/components/base/visual'

/**
 * Fila de análise de alertas (SPEC-2-002, card f7591165, CA-2-06/07).
 * Login na própria página (padrão da caixa — fila é por permissão read_alerts).
 * Transições: Iniciar análise → Registrar decisão (com decisão vinculada) →
 * Encerrar (justificativa fica no histórico). Sem IA e sem ação em anúncios.
 */

function dataBR(iso: string | null): string {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}

function BadgeEstado({ estado }: { estado: string }) {
  const cls =
    estado === 'open'
      ? 'bg-amber-100 text-amber-800'
      : estado === 'in_review'
        ? 'bg-sky-100 text-sky-800'
        : estado === 'decided'
          ? 'bg-violet-100 text-violet-800'
          : 'bg-gray-100 text-gray-600'
  return (
    <span className={'rounded-full px-2 py-0.5 text-xs font-semibold ' + cls}>
      {rotuloEstadoAlerta(estado)}
    </span>
  )
}

// Frase do alerta em linguagem de quem toca a loja (o texto técnico do servidor
// continua gravado no histórico; aqui só muda como aparece na tela).
const NOME_METRICA: Record<string, string> = {
  custo_por_resultado: 'Custo por lead',
  cpc: 'Custo por clique',
  cpm: 'Custo por mil exibições',
  ctr: 'Taxa de cliques',
  gasto: 'Investimento',
  resultados: 'Leads',
  cliques: 'Cliques',
  impressoes: 'Exibições',
}
const CANAL_TXT: Record<string, string> = { meta_ads: 'na Meta', google_ads: 'no Google' }
const DINHEIRO = ['custo_por_resultado', 'cpc', 'cpm', 'gasto']
const PLURAL = ['resultados', 'cliques', 'impressoes']

function valorAlerta(m: string, v: number | null): string {
  if (v === null || v === undefined) return '—'
  if (DINHEIRO.includes(m)) return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
  if (m === 'ctr') return v.toLocaleString('pt-BR', { maximumFractionDigits: 2 }) + '%'
  return Math.round(v).toLocaleString('pt-BR')
}

function fraseAlerta(a: AlertaItem): string {
  const pct = a.variation_pct === null ? '' : ' ' + Math.round(Math.abs(a.variation_pct)) + '%'
  const caiu = (a.variation_pct ?? 0) < 0
  const verbo = PLURAL.includes(a.metric) ? (caiu ? 'caíram' : 'subiram') : caiu ? 'caiu' : 'subiu'
  const quando = a.period_kind === 'monthly' ? 'no último mês' : 'na última quinzena'
  const nome = NOME_METRICA[a.metric] ?? a.metric
  const canal = CANAL_TXT[a.canal] ?? 'em ' + a.canal
  return nome + ' ' + verbo + pct + ' ' + canal + ' ' + quando
}

function dataCurta(iso: string): string {
  const p = (iso || '').slice(0, 10).split('-')
  return p.length === 3 ? p[2] + '/' + p[1] : iso
}

export default function Alertas() {
  const [user, setUser] = useState(pb.authStore.isValid ? pb.authStore.record : null)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erroAuth, setErroAuth] = useState('')
  const [entrando, setEntrando] = useState(false)
  const [itens, setItens] = useState<AlertaItem[]>([])
  const [carregando, setCarregando] = useState(false)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [ocupado, setOcupado] = useState('')
  const [justificativa, setJustificativa] = useState('')

  const carregar = useCallback(async () => {
    if (!pb.authStore.isValid) return
    setCarregando(true)
    setErro('')
    try {
      setItens(await listarAlertas())
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não foi possível carregar a fila')
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
    setItens([])
    setErro('')
    setAviso('')
  }

  async function mover(item: AlertaItem, acao: 'iniciar' | 'decidir' | 'encerrar') {
    setOcupado(item.id)
    setErro('')
    setAviso('')
    try {
      if (acao === 'iniciar') {
        await transicionar(item.id, { state: 'in_review' })
        setAviso('Alerta em análise.')
      } else if (acao === 'decidir') {
        const id = window.prompt('ID da decisão vinculada (em Decisões):')
        if (!id) {
          setOcupado('')
          return
        }
        await transicionar(item.id, { state: 'decided', decision_id: id.trim() })
        setAviso('Decisão vinculada ao alerta.')
      } else {
        if (justificativa.trim() === '') {
          setErro('Escreva a justificativa do encerramento (fica no histórico).')
          setOcupado('')
          return
        }
        await transicionar(item.id, { state: 'closed', justificativa: justificativa.trim() })
        setJustificativa('')
        setAviso('Alerta encerrado — justificativa registrada no histórico.')
      }
      await carregar()
    } catch (e) {
      setErro(e instanceof Error ? e.message : 'não foi possível mover o alerta')
    } finally {
      setOcupado('')
    }
  }

  if (!user) {
    return (
      <div className="mx-auto max-w-md px-4 py-10">
        <CabecalhoTela titulo="Alertas" subtitulo="Fila de análise dos alertas gerados" />
        <div className="rounded-cartao border border-border bg-white p-6 shadow-sm">
          <div className="mb-3 flex items-center gap-2">
            <LogIn className="h-4 w-4 text-primary" />
            <p className="font-medium">Entrar para ver a fila</p>
          </div>
          <p className="mb-4 text-sm text-muted-foreground">
            A fila mostra os alertas gerados pelas regras aprovadas — cada pessoa vê conforme a
            permissão que recebeu.
          </p>
          <div className="space-y-3">
            <input
              type="email"
              value={email}
              onChange={(ev) => setEmail(ev.target.value)}
              placeholder="seu email @haisan.com.br"
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
            />
            <input
              type="password"
              value={senha}
              onChange={(ev) => setSenha(ev.target.value)}
              placeholder="senha"
              onKeyDown={(ev) => {
                if (ev.key === 'Enter') void entrar()
              }}
              className="w-full rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
            />
            {erroAuth && <p className="text-xs text-red-600">{erroAuth}</p>}
            <button
              onClick={() => void entrar()}
              disabled={entrando || !email || !senha}
              className="w-full rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary disabled:opacity-60"
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
      <CabecalhoTela
        titulo="Alertas"
        subtitulo="Avisos de quando um número de marketing sobe ou cai muito. Para cada um: comece a análise, registre o que foi decidido e encerre."
        acoes={
          <>
            <button
              onClick={() => void carregar()}
              className="flex items-center gap-1.5 rounded-md border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50"
              aria-label="Recarregar fila de alertas"
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

      <div className="mt-4 mb-4 rounded-cartao border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-900">
        Logado como <strong>{String(user.email ?? '')}</strong>
      </div>

      {erro && <EstadoErro mensagem={erro} aoTentar={() => void carregar()} />}
      {aviso && !erro && (
        <div className="mb-4 rounded-cartao border border-sky-300 bg-sky-50 px-4 py-3 text-sm text-sky-900">
          {aviso}
        </div>
      )}

      {carregando ? (
        <EstadoCarregando linhas={2} />
      ) : itens.length === 0 ? (
        <EstadoVazio
          titulo="Nenhum alerta na fila"
          descricao="Quando um número de marketing sobe ou cai além do combinado em Critérios, o aviso aparece aqui."
        />
      ) : (
        <div className="space-y-3">
          {itens.map((item) => (
            <div key={item.id} className="rounded-cartao border border-border bg-white p-4">
              <div className="flex flex-wrap items-center gap-2">
                <BadgeEstado estado={item.state} />
                <span className="text-xs text-muted-foreground">
                  {item.period_kind === 'monthly' ? 'Mês' : 'Quinzena'} de{' '}
                  {dataCurta(item.period_current_start)} a {dataCurta(item.period_current_end)},
                  comparada com a anterior
                </span>
                <span className="text-xs text-muted-foreground">
                  gerado em {dataBR(item.created)}
                </span>
              </div>
              <p className="mt-2 text-base font-semibold" title={item.trigger_summary}>
                {fraseAlerta(item)}
              </p>
              <p className="mt-1 text-sm text-muted-foreground">
                Antes {valorAlerta(item.metric, item.previous_value)} · agora{' '}
                <span className="font-semibold text-foreground">
                  {valorAlerta(item.metric, item.current_value)}
                </span>{' '}
                · quem acompanha: {item.responsible_email ?? 'ninguém definido'}
              </p>
              {item.state !== 'closed' && (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  {item.state === 'open' && (
                    <button
                      onClick={() => void mover(item, 'iniciar')}
                      disabled={ocupado === item.id}
                      className="rounded-md border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
                    >
                      Iniciar análise
                    </button>
                  )}
                  {item.state === 'in_review' && (
                    <button
                      onClick={() => void mover(item, 'decidir')}
                      disabled={ocupado === item.id}
                      className="rounded-md border border-border bg-white px-3 py-2 text-sm font-medium hover:bg-gray-50 disabled:opacity-60"
                    >
                      Registrar decisão vinculada
                    </button>
                  )}
                  {(item.state === 'in_review' || item.state === 'decided') && (
                    <button
                      onClick={() => void mover(item, 'encerrar')}
                      disabled={ocupado === item.id}
                      className="rounded-md bg-primary px-3 py-2 text-sm font-medium text-white hover:bg-primary disabled:opacity-60"
                    >
                      Encerrar
                    </button>
                  )}
                  {(item.state === 'in_review' || item.state === 'decided') && (
                    <input
                      value={justificativa}
                      onChange={(ev) => setJustificativa(ev.target.value)}
                      placeholder="justificativa do encerramento (obrigatória)"
                      className="min-w-0 flex-1 rounded-md border border-border bg-white px-3 py-2 text-sm outline-none focus:border-primary"
                    />
                  )}
                </div>
              )}
              {item.state === 'decided' && (
                <p className="mt-2 text-xs text-muted-foreground">
                  Decisão vinculada: {item.decision_id} — encerre com justificativa para fechar o
                  ciclo.
                </p>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="mt-6 flex items-center gap-1.5 text-xs text-muted-foreground">
        <BellRing className="h-3.5 w-3.5" aria-hidden="true" />
        Os alertas são conferidos todo dia às 06:15. Só as regras aprovadas em Critérios geram
        alerta.
      </p>
    </div>
  )
}
