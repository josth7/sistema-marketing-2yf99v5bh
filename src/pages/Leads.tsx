/**
 * Página de Leads (CRM próprio — fase 4, card 1).
 *
 * Tabela com filtros por status/origem/busca, criação manual, edição de status
 * com trilha de eventos, importação por CSV colado (planilha da agência).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import pb from '@/lib/pocketbase/client'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Textarea } from '@/components/ui/textarea'
import {
  CabecalhoPagina,
  EstadoCarregando,
  EstadoErro,
  EstadoVazio,
} from '@/components/base/estados'
import {
  STATUS_LEADS,
  ORIGENS_LEADS,
  listarLeads,
  criarLead,
  editarLead,
  eventosDoLead,
  registrarConversao,
  resumoConversoes,
  dashboardCrm,
  linkWhatsapp,
  importarLeadsCsv,
  conversaDoLead,
  rotuloAutor,
  descricaoMidia,
  type Lead,
  type LeadEvento,
  type ResultadoImportacao,
} from '@/lib/marketing/crm'

const ROTULO_STATUS: Record<string, string> = {
  novo: 'Novo',
  em_contato: 'Em contato',
  orcamento: 'Orçamento',
  fechado: 'Fechado',
  perdido: 'Perdido',
}

const COR_STATUS: Record<string, string> = {
  novo: 'bg-blue-100 text-blue-800',
  em_contato: 'bg-amber-100 text-amber-800',
  orcamento: 'bg-purple-100 text-purple-800',
  fechado: 'bg-emerald-100 text-emerald-800',
  perdido: 'bg-gray-200 text-gray-700',
}

const ROTULO_ORIGEM: Record<string, string> = {
  meta: 'Meta',
  google: 'Google',
  site: 'Site',
  whatsapp: 'WhatsApp',
  manual: 'Manual',
  importacao: 'Importado',
}

export default function Leads() {
  const [itens, setItens] = useState<Lead[]>([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState<string | null>(null)
  const [user, setUser] = useState(pb.authStore.isValid ? pb.authStore.record : null)
  const [email, setEmail] = useState('')
  const [senha, setSenha] = useState('')
  const [erroAuth, setErroAuth] = useState<string | null>(null)
  const [entrando, setEntrando] = useState(false)
  const [filtroStatus, setFiltroStatus] = useState<string>('todos')
  const [busca, setBusca] = useState('')
  const [msg, setMsg] = useState<string | null>(null)
  // criação
  const [abrirCriar, setAbrirCriar] = useState(false)
  const [nNome, setNNome] = useState('')
  const [nTelefone, setNTelefone] = useState('')
  const [nEmail, setNEmail] = useState('')
  const [nOrigem, setNOrigem] = useState('manual')
  const [nObs, setNObs] = useState('')
  const [criando, setCriando] = useState(false)
  const [erroCriar, setErroCriar] = useState<string | null>(null)
  // detalhe
  const [detalhe, setDetalhe] = useState<Lead | null>(null)
  // conversa do WhatsApp na ficha (SPEC-3-005, CA-3-15)
  const [conversa, setConversa] = useState<{
    ok: boolean
    total: number
    itens: Array<Record<string, unknown>>
  } | null>(null)
  const [erroConversa, setErroConversa] = useState<string>('')
  const [carregandoConversa, setCarregandoConversa] = useState(false)
  const [eventos, setEventos] = useState<LeadEvento[]>([])
  const [novoStatus, setNovoStatus] = useState('')
  const [salvando, setSalvando] = useState(false)
  // conversão (venda)
  const [convAberto, setConvAberto] = useState(false)
  const [convValor, setConvValor] = useState('')
  const [convCanal, setConvCanal] = useState('whatsapp')
  const [convDescricao, setConvDescricao] = useState('')
  const [convEnviando, setConvEnviando] = useState(false)
  const [convErro, setConvErro] = useState<string | null>(null)
  // resumo da fila de conversões (Meta/Google)
  const [convResumo, setConvResumo] = useState<{
    pendentes: number
    enviadas: number
    erros: number
    valor_pendente: number
    valor_enviado: number
  } | null>(null)
  // dashboard do CRM (receita, ticket, taxa, lead time, responsáveis)
  const [dash, setDash] = useState<DashboardCrm | null>(null)
  // vista: lista ou funil
  const [vista, setVista] = useState<'lista' | 'funil'>('lista')
  // importação
  const [abrirImportar, setAbrirImportar] = useState(false)
  const [csv, setCsv] = useState('')
  const [importando, setImportando] = useState(false)
  const [resultado, setResultado] = useState<ResultadoImportacao | null>(null)
  const [erroImportar, setErroImportar] = useState<string | null>(null)

  const carregar = useCallback(async () => {
    if (!pb.authStore.isValid) {
      setCarregando(false)
      setErro('Entre com o seu usuário para ver os leads.')
      return
    }
    setCarregando(true)
    setErro(null)
    try {
      setItens(await listarLeads())
      try {
        setConvResumo(await resumoConversoes())
      } catch {
        setConvResumo(null)
      }
      try {
        setDash(await dashboardCrm())
      } catch {
        setDash(null)
      }
    } catch (e) {
      setErro(e instanceof Error ? e.message : String(e))
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
      setErro(null)
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
    setErro(null)
  }

  const filtrados = useMemo(() => {
    let out = itens
    if (filtroStatus !== 'todos') out = out.filter((l) => l.status === filtroStatus)
    if (busca.trim() !== '') {
      const q = busca.trim().toLowerCase()
      out = out.filter(
        (l) =>
          l.nome.toLowerCase().includes(q) ||
          l.telefone.toLowerCase().includes(q) ||
          l.email.toLowerCase().includes(q),
      )
    }
    return out
  }, [itens, filtroStatus, busca])

  /** Indicadores do dashboard (taxa de fechamento, por origem). */
  const indicadores = useMemo(() => {
    const total = itens.length
    const fechados = itens.filter((l) => l.status === 'fechado').length
    const perdidos = itens.filter((l) => l.status === 'perdido').length
    const decididos = fechados + perdidos
    const taxa = decididos > 0 ? Math.round((fechados / decididos) * 100) : null
    const porOrigem: Record<string, number> = {}
    for (const l of itens) {
      const o = l.origem || 'manual'
      porOrigem[o] = (porOrigem[o] || 0) + 1
    }
    return { total, fechados, perdidos, taxa, porOrigem }
  }, [itens])

  /** Move um lead para o status seguinte/anterior no funil. */
  const moverNoFunil = async (l: Lead, direcao: 'avancar' | 'voltar') => {
    const ordem = STATUS_LEADS.map((s) => s.valor)
    const idx = ordem.indexOf(l.status)
    const novo = direcao === 'avancar' ? ordem[idx + 1] : ordem[idx - 1]
    if (!novo) return
    try {
      await editarLead(l.id, { status: novo })
      setMsg(`${l.nome}: ${ROTULO_STATUS[novo]}.`)
      await carregar()
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    }
  }

  const contagem = useMemo(() => {
    const c: Record<string, number> = {}
    for (const s of STATUS_LEADS) c[s.valor] = 0
    for (const l of itens) c[l.status] = (c[l.status] || 0) + 1
    return c
  }, [itens])

  const criar = async () => {
    if (nNome.trim() === '') {
      setErroCriar('Informe o nome do lead.')
      return
    }
    setCriando(true)
    setErroCriar(null)
    try {
      await criarLead({
        nome: nNome.trim(),
        telefone: nTelefone.trim(),
        email: nEmail.trim(),
        origem: nOrigem,
        observacoes: nObs.trim(),
      })
      setAbrirCriar(false)
      setNNome('')
      setNTelefone('')
      setNEmail('')
      setNOrigem('manual')
      setNObs('')
      setMsg('Lead criado.')
      await carregar()
    } catch (e) {
      setErroCriar(e instanceof Error ? e.message : String(e))
    } finally {
      setCriando(false)
    }
  }

  const abrirDetalhe = async (l: Lead) => {
    setDetalhe(l)
    setConversa(null)
    setErroConversa('')
    setCarregandoConversa(true)
    void conversaDoLead(l.id)
      .then((r) =>
        setConversa(
          r as unknown as { ok: boolean; total: number; itens: Array<Record<string, unknown>> },
        ),
      )
      .catch((e: Error) => setErroConversa(e.message))
      .finally(() => setCarregandoConversa(false))
    setNovoStatus(l.status)
    setMsg(null)
    try {
      setEventos(await eventosDoLead(l.id))
    } catch {
      setEventos([])
    }
  }

  const salvarStatus = async () => {
    if (!detalhe) return
    setSalvando(true)
    try {
      await editarLead(detalhe.id, { status: novoStatus })
      setMsg('Status atualizado.')
      await carregar()
      const atualizado = { ...detalhe, status: novoStatus as Lead['status'] }
      setDetalhe(atualizado)
      setEventos(await eventosDoLead(detalhe.id))
    } catch (e) {
      setMsg(e instanceof Error ? e.message : String(e))
    } finally {
      setSalvando(false)
    }
  }

  const abrirConversao = () => {
    if (!detalhe) return
    setConvAberto(true)
    setConvValor('')
    setConvCanal('whatsapp')
    setConvDescricao('')
    setConvErro(null)
  }

  const salvarConversao = async () => {
    if (!detalhe) return
    const valor = Number(convValor.replace(',', '.'))
    if (!Number.isFinite(valor) || valor <= 0) {
      setConvErro('Informe o valor da venda (maior que zero).')
      return
    }
    setConvEnviando(true)
    setConvErro(null)
    try {
      await registrarConversao(detalhe.id, {
        valor,
        canal: convCanal,
        descricao: convDescricao.trim(),
      })
      setConvAberto(false)
      setMsg('Conversão registrada — lead marcado como Fechado.')
      await carregar()
      const atualizado = { ...detalhe, status: 'fechado' as Lead['status'] }
      setDetalhe(atualizado)
      setEventos(await eventosDoLead(detalhe.id))
    } catch (e) {
      setConvErro(e instanceof Error ? e.message : String(e))
    } finally {
      setConvEnviando(false)
    }
  }

  const importar = async () => {
    setImportando(true)
    setErroImportar(null)
    setResultado(null)
    try {
      const r = await importarLeadsCsv(csv)
      setResultado(r)
      await carregar()
    } catch (e) {
      setErroImportar(e instanceof Error ? e.message : String(e))
    } finally {
      setImportando(false)
    }
  }

  return (
    <div className="flex-1 p-6 md:p-10 space-y-6">
      <CabecalhoPagina
        titulo="Leads (CRM)"
        descricao="Base própria de leads — origem, pipeline de status e trilha de eventos. Importação da planilha da agência por CSV."
      />

      {/* alternância Lista | Funil */}
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          variant={vista === 'lista' ? 'default' : 'outline'}
          onClick={() => setVista('lista')}
        >
          Lista
        </Button>
        <Button
          size="sm"
          variant={vista === 'funil' ? 'default' : 'outline'}
          onClick={() => setVista('funil')}
        >
          Funil de vendas
        </Button>
      </div>

      {/* dashboard (receita, ticket, taxa, lead time) — inspirado no CRM atual */}
      {dash && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Receita ganha</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                R$ {dash.receita.ganha.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
              <p className="text-xs text-muted-foreground">
                {dash.receita.n_conversoes} conversão(ões)
              </p>
            </div>
            <div className="rounded-lg border px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Ticket médio</p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {dash.ticket_medio === null
                  ? '—'
                  : 'R$ ' + dash.ticket_medio.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </p>
            </div>
            <div className="rounded-lg border px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Taxa de conversão
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">
                {dash.taxa_conversao === null ? '—' : dash.taxa_conversao + '%'}
              </p>
            </div>
            <div className="rounded-lg border px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Pipeline em aberto
              </p>
              <p className="mt-1 text-2xl font-semibold tabular-nums">{dash.receita.em_aberto}</p>
              <p className="text-xs text-muted-foreground">lead(s) ativo(s)</p>
            </div>
          </div>
          <div className="grid gap-3 sm:grid-cols-4">
            <div className="rounded-lg border px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Lead time (venda)
              </p>
              <p className="mt-1 text-xl font-semibold tabular-nums">
                {dash.lead_time.media === null ? '—' : dash.lead_time.media + ' dias'}
              </p>
              <p className="text-xs text-muted-foreground">
                {dash.lead_time.n > 0
                  ? 'mediana ' +
                    dash.lead_time.mediana +
                    'd · min ' +
                    dash.lead_time.min +
                    'd · max ' +
                    dash.lead_time.max +
                    'd'
                  : 'sem vendas com data de entrada'}
              </p>
            </div>
            <div className="rounded-lg border px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Novos no mês</p>
              <p className="mt-1 text-xl font-semibold tabular-nums">{dash.criados_no_mes}</p>
              <p className="text-xs text-muted-foreground">
                {dash.media_dia === null ? 'sem média' : dash.media_dia + '/dia com lead'}
              </p>
            </div>
            <div className="rounded-lg border px-4 py-3 sm:col-span-2">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">Por origem</p>
              <p className="mt-1 text-sm">
                {Object.entries(dash.por_origem)
                  .sort((a, b) => b[1] - a[1])
                  .map(([o, n]) => (ROTULO_ORIGEM[o] || o) + ': ' + n)
                  .join(' · ') || '—'}
              </p>
            </div>
          </div>
          {dash.top_responsaveis.length > 0 && (
            <div className="rounded-lg border px-4 py-3">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                Top responsáveis (valor ganho)
              </p>
              <div className="mt-2 space-y-1">
                {dash.top_responsaveis.map((r, i) => (
                  <p key={r.owner} className="text-sm">
                    <span className="mr-2 text-muted-foreground">#{i + 1}</span>
                    <strong>{r.nome}</strong>
                    <span className="ml-2 text-muted-foreground">
                      {r.leads} lead(s) · {r.fechados} fechado(s) · R${' '}
                      {r.valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </p>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* resumo por status */}
      <div className="flex flex-wrap gap-2">
        {STATUS_LEADS.map((s) => (
          <button
            key={s.valor}
            onClick={() => setFiltroStatus(filtroStatus === s.valor ? 'todos' : s.valor)}
            className={`rounded-lg border px-3 py-1.5 text-sm ${
              filtroStatus === s.valor ? 'border-primary bg-primary/5 font-medium' : 'border-border'
            }`}
          >
            {s.rotulo}: <strong>{contagem[s.valor] ?? 0}</strong>
          </button>
        ))}
        {filtroStatus !== 'todos' && (
          <button
            onClick={() => setFiltroStatus('todos')}
            className="text-sm text-muted-foreground underline"
          >
            limpar filtro
          </button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Input
          placeholder="Buscar por nome, telefone ou e-mail…"
          value={busca}
          onChange={(e) => setBusca(e.target.value)}
          className="max-w-xs"
        />
        <div className="ml-auto flex gap-2">
          <Button variant="outline" onClick={() => setAbrirImportar(true)}>
            Importar CSV
          </Button>
          <Button onClick={() => setAbrirCriar(true)}>Novo lead</Button>
        </div>
      </div>

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
            <CardTitle className="text-base">Entrar para ver os leads</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="lead-login-email">E-mail</Label>
              <Input
                id="lead-login-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu.email@haisan.com.br"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="lead-login-senha">Senha</Label>
              <Input
                id="lead-login-senha"
                type="password"
                value={senha}
                onChange={(e) => setSenha(e.target.value)}
                placeholder="••••••••"
              />
            </div>
            {erroAuth && <p className="text-sm text-destructive">{erroAuth}</p>}
            <Button onClick={() => void entrar()} disabled={entrando}>
              {entrando ? 'Entrando…' : 'Entrar'}
            </Button>
          </CardContent>
        </Card>
      )}

      {convResumo && (
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-lg border px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Conversões enviadas p/ Meta/Google
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {convResumo.enviadas}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                · R${' '}
                {convResumo.valor_enviado.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </p>
          </div>
          <div className="rounded-lg border px-4 py-3">
            <p className="text-xs uppercase tracking-wide text-muted-foreground">
              Na fila (o Maestro envia às plataformas)
            </p>
            <p className="mt-1 text-2xl font-semibold tabular-nums">
              {convResumo.pendentes}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                · R${' '}
                {convResumo.valor_pendente.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
              </span>
            </p>
          </div>
        </div>
      )}

      {msg && (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2 text-sm text-emerald-800">
          {msg}
        </p>
      )}

      {carregando && <EstadoCarregando />}
      {erro && <EstadoErro mensagem={erro} onTentarNovamente={() => void carregar()} />}
      {!carregando && !erro && itens.length === 0 && (
        <EstadoVazio
          titulo="Nenhum lead ainda"
          descricao="Crie o primeiro lead manualmente ou importe a planilha da agência (botão Importar CSV)."
        />
      )}
      {/* FUNIL DE VENDAS (kanban por status) */}
      {!carregando && !erro && itens.length > 0 && vista === 'funil' && (
        <div
          className="grid gap-3 overflow-x-auto pb-2"
          style={{ gridTemplateColumns: 'repeat(5, minmax(220px, 1fr))' }}
        >
          {STATUS_LEADS.map((s) => {
            const coluna = itens.filter((l) => l.status === s.valor)
            return (
              <div key={s.valor} className="rounded-lg border bg-muted/30 p-2">
                <p className="mb-2 flex items-center justify-between px-1 text-sm font-medium">
                  {s.rotulo}
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs tabular-nums text-muted-foreground">
                    {coluna.length}
                  </span>
                </p>
                <div className="space-y-2">
                  {coluna.length === 0 && (
                    <p className="px-1 py-3 text-center text-xs text-muted-foreground">vazio</p>
                  )}
                  {coluna.map((l) => (
                    <div key={l.id} className="rounded-md border bg-background p-2 shadow-sm">
                      <div className="flex items-center justify-between gap-1">
                        <p className="truncate text-sm font-medium">{l.nome}</p>
                        <span
                          className={
                            'shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ' +
                            (l.temperatura === 'positivo'
                              ? 'bg-emerald-100 text-emerald-700'
                              : l.temperatura === 'frio'
                                ? 'bg-blue-100 text-blue-700'
                                : 'bg-gray-100 text-gray-600')
                          }
                        >
                          {l.temperatura === 'positivo'
                            ? 'quente'
                            : l.temperatura === 'frio'
                              ? 'frio'
                              : 'neutro'}
                        </span>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {l.telefone || l.email || '—'}
                      </p>
                      {l.owner_nome && (
                        <p className="mt-0.5 text-xs text-emerald-700">👤 {l.owner_nome}</p>
                      )}
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        {ROTULO_ORIGEM[l.origem] || l.origem}
                        {l.campanha ? ' · ' + l.campanha : ''}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs"
                          disabled={s.valor === 'novo'}
                          onClick={() => void moverNoFunil(l, 'voltar')}
                        >
                          ←
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs"
                          disabled={s.valor === 'perdido'}
                          onClick={() => void moverNoFunil(l, 'avancar')}
                        >
                          →
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          className="ml-auto h-6 px-2 text-xs"
                          onClick={() => void abrirDetalhe(l)}
                        >
                          Abrir
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* LISTA (tabela) */}
      {!carregando && !erro && itens.length > 0 && vista === 'lista' && (
        <Card>
          <CardContent className="pt-6">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-xs uppercase tracking-wide text-muted-foreground">
                    <th className="py-2 pr-3">Nome</th>
                    <th className="py-2 pr-3">Telefone</th>
                    <th className="py-2 pr-3">Origem</th>
                    <th className="py-2 pr-3">Status</th>
                    <th className="py-2 pr-3">Data</th>
                    <th className="py-2">Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {filtrados.map((l) => (
                    <tr key={l.id} className="border-b last:border-0">
                      <td className="py-2 pr-3 font-medium">{l.nome}</td>
                      <td className="py-2 pr-3">{l.telefone || '—'}</td>
                      <td className="py-2 pr-3">{ROTULO_ORIGEM[l.origem] || l.origem}</td>
                      <td className="py-2 pr-3">
                        <Badge className={COR_STATUS[l.status] || ''}>
                          {ROTULO_STATUS[l.status] || l.status}
                        </Badge>
                      </td>
                      <td className="py-2 pr-3">{(l.data_lead || '').slice(0, 10) || '—'}</td>
                      <td className="py-2">
                        <Button size="sm" variant="ghost" onClick={() => void abrirDetalhe(l)}>
                          Abrir
                        </Button>
                      </td>
                    </tr>
                  ))}
                  {filtrados.length === 0 && (
                    <tr>
                      <td colSpan={6} className="py-4 text-center text-muted-foreground">
                        Nenhum lead com esse filtro.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            <p className="mt-3 text-xs text-muted-foreground">
              {filtrados.length} de {itens.length} leads
            </p>
          </CardContent>
        </Card>
      )}

      {/* criar */}
      <Dialog open={abrirCriar} onOpenChange={setAbrirCriar}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Novo lead</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1">
              <Label htmlFor="lead-nome">Nome *</Label>
              <Input id="lead-nome" value={nNome} onChange={(e) => setNNome(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="lead-tel">Telefone</Label>
                <Input
                  id="lead-tel"
                  value={nTelefone}
                  onChange={(e) => setNTelefone(e.target.value)}
                  placeholder="(41) 99999-9999"
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="lead-email">E-mail</Label>
                <Input id="lead-email" value={nEmail} onChange={(e) => setNEmail(e.target.value)} />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Origem</Label>
              <Select value={nOrigem} onValueChange={setNOrigem}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {ORIGENS_LEADS.map((o) => (
                    <SelectItem key={o} value={o}>
                      {ROTULO_ORIGEM[o] || o}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <Label htmlFor="lead-obs">Observações</Label>
              <Textarea
                id="lead-obs"
                value={nObs}
                onChange={(e) => setNObs(e.target.value)}
                rows={3}
              />
            </div>
            {erroCriar && <p className="text-sm text-destructive">{erroCriar}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAbrirCriar(false)}>
                Cancelar
              </Button>
              <Button onClick={() => void criar()} disabled={criando}>
                {criando ? 'Criando…' : 'Criar lead'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* detalhe */}
      <Dialog open={!!detalhe} onOpenChange={(aberto) => !aberto && setDetalhe(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detalhe?.nome}</DialogTitle>
          </DialogHeader>
          {detalhe && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-2 text-sm">
                <p>
                  <span className="text-muted-foreground">Telefone:</span> {detalhe.telefone || '—'}
                </p>
                <p>
                  <span className="text-muted-foreground">E-mail:</span> {detalhe.email || '—'}
                </p>
                <p>
                  <span className="text-muted-foreground">Origem:</span>{' '}
                  {ROTULO_ORIGEM[detalhe.origem] || detalhe.origem}
                </p>
                <p>
                  <span className="text-muted-foreground">Campanha:</span> {detalhe.campanha || '—'}
                </p>
              </div>
              {detalhe.observacoes && (
                <p className="rounded-md bg-muted px-3 py-2 text-sm">{detalhe.observacoes}</p>
              )}
              <div className="flex items-end gap-2">
                <div className="space-y-1 flex-1">
                  <Label>Status</Label>
                  <Select value={novoStatus} onValueChange={setNovoStatus}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {STATUS_LEADS.map((s) => (
                        <SelectItem key={s.valor} value={s.valor}>
                          {s.rotulo}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  onClick={() => void salvarStatus()}
                  disabled={salvando || novoStatus === detalhe.status}
                >
                  {salvando ? 'Salvando…' : 'Salvar status'}
                </Button>
              </div>
              {/* WhatsApp como canal de venda (fase 4, card 2) */}
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                <span className="text-sm text-muted-foreground">Venda:</span>
                {linkWhatsapp(detalhe.telefone) && (
                  <a
                    href={linkWhatsapp(detalhe.telefone) as string}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-md border bg-white px-3 py-1.5 text-sm font-medium text-emerald-700 hover:bg-emerald-50"
                  >
                    Abrir no WhatsApp ↗
                  </a>
                )}
                {detalhe.status !== 'fechado' && (
                  <Button size="sm" onClick={abrirConversao}>
                    Registrar conversão
                  </Button>
                )}
              </div>
              {/* Conversa do WhatsApp (SPEC-3-005, CA-3-15) */}
              <div className="rounded-md border">
                <div className="flex items-center justify-between border-b bg-muted/40 px-3 py-2">
                  <p className="text-sm font-medium">Conversa no WhatsApp</p>
                  <span className="text-xs text-muted-foreground">
                    {carregandoConversa
                      ? 'Carregando…'
                      : conversa
                        ? conversa.total + ' mensagem(ns)'
                        : ''}
                  </span>
                </div>
                <div className="max-h-72 space-y-2 overflow-y-auto p-3">
                  {carregandoConversa && (
                    <p className="text-xs text-muted-foreground">Buscando a conversa…</p>
                  )}
                  {!carregandoConversa && erroConversa && (
                    <p className="text-xs text-muted-foreground">
                      {erroConversa.indexOf('permissão') >= 0
                        ? 'Você não tem acesso à conversa deste lead.'
                        : erroConversa}
                    </p>
                  )}
                  {!carregandoConversa && !erroConversa && conversa?.total === 0 && (
                    <p className="text-xs text-muted-foreground">
                      Nenhuma mensagem do WhatsApp para este lead ainda.
                    </p>
                  )}
                  {!carregandoConversa &&
                    (conversa?.itens || []).map((m) => {
                      const msg = m as unknown as {
                        id: string
                        autor: string
                        tipo: string
                        texto: string
                        texto_original: string
                        media_url: string
                        media_mimetype: string
                        media_duracao_s: number
                        status: string
                        enviada_em: string
                        editada_em: string
                        apagada: boolean
                      }
                      const quando = String(msg.enviada_em || '')
                        .replace('T', ' ')
                        .slice(0, 16)
                      return (
                        <div
                          key={msg.id}
                          className={
                            'rounded-md px-3 py-2 text-sm ' +
                            (msg.autor === 'cliente'
                              ? 'bg-muted/60'
                              : 'ml-6 bg-emerald-50 dark:bg-emerald-950/30')
                          }
                        >
                          <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
                            <span className="font-medium">{rotuloAutor(msg.autor)}</span>
                            <span>{quando}</span>
                            {msg.status && <span>· {msg.status}</span>}
                            {msg.editada_em ? <span>· editada</span> : null}
                          </div>
                          {msg.apagada ? (
                            <p className="italic text-muted-foreground">
                              Mensagem apagada por quem enviou
                            </p>
                          ) : (
                            <>
                              {/* texto renderizado como TEXTO: nunca HTML */}
                              {msg.texto && <p className="whitespace-pre-wrap">{msg.texto}</p>}
                              {msg.editada_em && msg.texto_original && (
                                <p className="mt-1 text-xs text-muted-foreground line-through">
                                  {msg.texto_original}
                                </p>
                              )}
                              {msg.media_url && (
                                <a
                                  href={msg.media_url}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="mt-1 inline-block text-xs underline"
                                >
                                  {descricaoMidia(m as never)}
                                </a>
                              )}
                              {!msg.texto && !msg.media_url && (
                                <p className="text-xs text-muted-foreground">({msg.tipo})</p>
                              )}
                            </>
                          )}
                        </div>
                      )
                    })}
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium">Trilha de eventos</p>
                <div className="space-y-1">
                  {eventos.length === 0 && (
                    <p className="text-xs text-muted-foreground">Sem eventos.</p>
                  )}
                  {eventos.map((ev) => (
                    <p key={ev.id} className="text-xs text-muted-foreground">
                      • {ev.texto}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* registrar conversão */}
      <Dialog open={convAberto} onOpenChange={setConvAberto}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Registrar conversão — {detalhe?.nome}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="conv-valor">Valor da venda (R$) *</Label>
                <Input
                  id="conv-valor"
                  value={convValor}
                  onChange={(e) => setConvValor(e.target.value)}
                  placeholder="1250,00"
                />
              </div>
              <div className="space-y-1">
                <Label>Canal</Label>
                <Select value={convCanal} onValueChange={setConvCanal}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="whatsapp">WhatsApp</SelectItem>
                    <SelectItem value="site">Site</SelectItem>
                    <SelectItem value="telefone">Telefone</SelectItem>
                    <SelectItem value="presencial">Presencial</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-1">
              <Label htmlFor="conv-desc">O que vendeu</Label>
              <Input
                id="conv-desc"
                value={convDescricao}
                onChange={(e) => setConvDescricao(e.target.value)}
                placeholder="Ex.: Poltrona hidráulica + lavatório"
              />
            </div>
            <p className="text-xs text-muted-foreground">
              A conversão marca o lead como <strong>Fechado</strong> e alimenta os eventos de
              conversão de volta para Meta/Google (próximo card).
            </p>
            {convErro && <p className="text-sm text-destructive">{convErro}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setConvAberto(false)}>
                Cancelar
              </Button>
              <Button onClick={() => void salvarConversao()} disabled={convEnviando}>
                {convEnviando ? 'Registrando…' : 'Registrar conversão'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* importar */}
      <Dialog open={abrirImportar} onOpenChange={setAbrirImportar}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Importar leads (CSV da planilha)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              Abre a planilha da agência, seleciona a aba "Leads", copia tudo e cola aqui (uma linha
              por lead; cabeçalho é detectado automaticamente). Colunas: nome, telefone, email,
              origem, campanha, data_lead, status, observacoes.
            </p>
            <Textarea
              value={csv}
              onChange={(e) => setCsv(e.target.value)}
              rows={10}
              placeholder={
                'Maria Silva;(41) 99123-4567;maria@email.com;meta;Salão — Tráfego;2026-10-05;fechado;Poltrona hidráulica'
              }
            />
            {erroImportar && <p className="text-sm text-destructive">{erroImportar}</p>}
            {resultado && (
              <div className="rounded-md border px-3 py-2 text-sm">
                <p>
                  <strong>{resultado.criados}</strong> criados ·{' '}
                  <strong>{resultado.duplicados}</strong> duplicados (já existiam) ·{' '}
                  <strong>{resultado.invalidos}</strong> inválidos
                </p>
                {resultado.erros.length > 0 && (
                  <ul className="mt-1 list-inside list-disc text-xs text-muted-foreground">
                    {resultado.erros.map((er, i) => (
                      <li key={i}>{er}</li>
                    ))}
                  </ul>
                )}
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setAbrirImportar(false)}>
                Fechar
              </Button>
              <Button onClick={() => void importar()} disabled={importando || csv.trim() === ''}>
                {importando ? 'Importando…' : 'Importar'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
