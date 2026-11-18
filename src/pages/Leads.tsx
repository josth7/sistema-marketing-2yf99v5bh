/**
 * Página de Leads (CRM próprio — fase 4, card 1).
 *
 * Tabela com filtros por status/origem/busca, criação manual, edição de status
 * com trilha de eventos, importação por CSV colado (planilha da agência).
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Calendar, Phone, User } from 'lucide-react'
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
import { Dica, DicaNumero } from '@/components/base/dica'
// SPEC-3-018 / RN-205: componentes de composição do visual novo
import { Cartao, CartaoDestaque, CabecalhoTela, PilulasFiltro } from '@/components/base/visual'

/**
 * Paginação da tela (28/10): a base da agência trouxe 1.529 leads e a tabela
 * montava todas as linhas de uma vez — a tela demorava e o navegador travava.
 * Agora só a página atual vai para o DOM. Os indicadores, o funil e a busca
 * continuam usando a lista inteira (é o que os torna corretos).
 */
const TAMANHO_PAGINA = 25
/** Teto de cards por coluna do funil — o resto aparece no contador da coluna. */
const LIMITE_COLUNA = 30
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
  linkChamarWhatsapp,
  importarLeadsCsv,
  conversaDoLead,
  rotuloAutor,
  descricaoMidia,
  type Lead,
  type LeadEvento,
  type ResultadoImportacao,
} from '@/lib/marketing/crm'

const ROTULO_STATUS: Record<string, string> = {
  entrada_lead: 'Entrada de lead',
  pre_atendimento_ia: 'Pré-atendimento com IA',
  mql: 'MQL (cliente respondeu)',
  orcamento: 'Orçamento',
  negociacao: 'Negociação',
  aguardando_pagamento: 'Aguardando pagamento',
  venda_realizada: 'Venda realizada',
  producao: 'Produção',
  finalizado: 'Finalizado',
  descartado: 'Descartado',
}

// ---------- IA do lead (CA-3-23) ----------
// A nota de 0 a 100 vem da conversa (interesse, poder de compra, urgência,
// perfil). Antes o card mostrava `temperatura`, que era só um espelho do
// status — ou seja, não informava nada sobre a chance real de venda.
function corNota(n: number | null): string {
  // visual sóbrio: só a nota alta ganha o acento; o resto fica em cinza
  if (n === null || n === undefined) return 'bg-muted text-muted-foreground'
  if (n >= 80) return 'bg-marca-1/10 text-marca-1'
  if (n >= 40) return 'bg-muted text-foreground'
  return 'bg-muted text-muted-foreground'
}

function rotuloNota(n: number | null): string {
  if (n === null || n === undefined) return '—'
  return String(n)
}

// Humor em selo suave com o nome escrito (sem emoji). Vermelho só para
// raiva/ameaça, e em tom de fundo /10.
const COR_HUMOR: Record<string, string> = {
  positivo: 'bg-marca-1/10 text-marca-1',
  neutro: 'bg-muted text-muted-foreground',
  negativo: 'bg-muted text-foreground',
  raiva: 'bg-destructive/10 text-destructive',
  ameaca: 'bg-destructive/10 font-medium text-destructive',
}

// Etapas em no máximo 4 famílias: neutro, andamento, ganho (acento) e perdido.
const ETAPA_NEUTRA = 'bg-muted text-muted-foreground'
const ETAPA_ANDAMENTO = 'bg-foreground/[0.07] text-foreground'
const ETAPA_GANHO = 'bg-marca-1/10 text-marca-1'
const ETAPA_PERDIDA = 'border-border bg-transparent text-muted-foreground'

const COR_STATUS: Record<string, string> = {
  entrada_lead: ETAPA_NEUTRA,
  pre_atendimento_ia: ETAPA_NEUTRA,
  mql: ETAPA_ANDAMENTO,
  negociacao: ETAPA_ANDAMENTO,
  aguardando_pagamento: ETAPA_ANDAMENTO,
  venda_realizada: ETAPA_GANHO,
  producao: ETAPA_ANDAMENTO,
  finalizado: ETAPA_GANHO,
  descartado: ETAPA_PERDIDA,
  orcamento: ETAPA_ANDAMENTO,
  fechado: ETAPA_GANHO,
  perdido: ETAPA_PERDIDA,
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
  const [soQuentes, setSoQuentes] = useState(false)
  const [busca, setBusca] = useState('')
  // 17/11: filtros por vendedor e por origem na barra do CRM (pedido da gestão)
  // abre já filtrado quando vem da Gestão de leads (/leads?vendedor=<id>)
  const [filtroVendedor, setFiltroVendedor] = useState<string>(() => {
    try {
      return new URLSearchParams(window.location.search).get('vendedor') || 'todos'
    } catch {
      return 'todos'
    }
  })
  const [filtroOrigem, setFiltroOrigem] = useState<string>('todos')
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
  // 17/11 (call com a Anézia): na ficha, trocar o vendedor escolhendo o nome,
  // corrigir o nome do cliente e lançar o valor da venda
  const [vendedoresLista, setVendedoresLista] = useState<
    { id: string; nome: string; final: string }[]
  >([])
  const [novoDono, setNovoDono] = useState('')
  const [trocando, setTrocando] = useState(false)
  const [editNome, setEditNome] = useState('')
  const [editValor, setEditValor] = useState('')
  const [salvandoDados, setSalvandoDados] = useState(false)
  useEffect(() => {
    if (!user) return
    pb.send('/backend/v1/crm/vendedores', { method: 'GET' })
      .then((r: { itens?: { id: string; nome: string; final: string }[] }) =>
        setVendedoresLista(r.itens || []),
      )
      .catch(() => setVendedoresLista([]))
  }, [user])
  const detalheId = detalhe?.id || ''
  useEffect(() => {
    if (!detalhe) return
    setEditNome(detalhe.nome || '')
    setEditValor(detalhe.valor ? String(detalhe.valor).replace('.', ',') : '')
    setNovoDono('')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detalheId])
  // conversa do WhatsApp na ficha (SPEC-3-005, CA-3-15)
  const [conversa, setConversa] = useState<{
    ok: boolean
    total: number
    itens: Array<Record<string, unknown>>
  } | null>(null)
  const [erroConversa, setErroConversa] = useState<string>('')
  const [carregandoConversa, setCarregandoConversa] = useState(false)
  // transferência para vendedor (CA-3-16) — usa pb.send direto, sem import novo
  const [transf, setTransf] = useState<{
    vendedor_nome: string
    regra: string
    estado: string
    detalhe: string
    envios: Array<{ motivo: string; modo: string; estado: string }>
  } | null>(null)
  const [transfErro, setTransfErro] = useState('')
  const [transferindo, setTransferindo] = useState(false)
  const [eventos, setEventos] = useState<LeadEvento[]>([])
  const [novoStatus, setNovoStatus] = useState('')
  // CA-3-72 (05/11): descartar EXIGE motivo. Antes o erro voltava 422 e não
  // aparecia — o vendedor clicava e nada acontecia, sem saber por quê.
  const [motivoPerda, setMotivoPerda] = useState('')
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
  // página atual da tabela (0-based)
  const [pagina, setPagina] = useState(0)
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
    // 17/11: por vendedor (dono do lead) — "Sem dono" mostra quem ninguém pegou
    if (filtroVendedor === '__sem_dono__') out = out.filter((l) => !l.owner_id)
    else if (filtroVendedor !== 'todos') out = out.filter((l) => l.owner_id === filtroVendedor)
    if (filtroOrigem !== 'todos') out = out.filter((l) => l.origem === filtroOrigem)
    // "só os quentes": nota 60+ da IA. É o filtro que o vendedor usa para
    // decidir a ordem do dia — sem ele, 40 conversas parecem todas iguais.
    if (soQuentes) out = out.filter((l) => (l.ia_nota ?? -1) >= 60)
    if (busca.trim() !== '') {
      // CA-3-72 (05/11): a busca acha o telefone em QUALQUER formato e o nome
      // sem acento. Antes só casava texto literal: "+55 41 99800-0099" não
      // achava nada e "jose" não achava "José".
      const semAcento = (t: string) =>
        t
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '')
          .toLowerCase()
      const soDigitos = (t: string) => (t || '').replace(/\D/g, '')
      const q = semAcento(busca.trim())
      const qDig = soDigitos(busca)
      // variantes do número: com 9 e sem 9 (celular brasileiro)
      const variantes = (d: string): string[] => {
        if (d === '') return []
        const v = [d]
        const ddd = d.slice(2, 4)
        const resto = d.slice(4)
        if (d.length === 13 && resto.charAt(0) === '9') v.push('55' + ddd + resto.slice(1))
        else if (d.length === 12) v.push('55' + ddd + '9' + resto)
        return v
      }
      const qVars = variantes(qDig)
      out = out.filter((l) => {
        if (semAcento(l.nome || '').includes(q)) return true
        if (semAcento(l.email || '').includes(q)) return true
        const tel = soDigitos(l.telefone)
        if (tel.includes(qDig) && qDig !== '') return true
        for (const v of qVars) if (tel.includes(v)) return true
        return false
      })
    }
    // mais recente primeiro (pedido da gestão, 06/11): a lista segue a ordem
    // de chegada. Na mesma data/hora, a maior nota da IA vem antes; para ver só
    // os de maior chance, use o filtro de quentes.
    out = [...out].sort((a, b) => {
      const porData = String(b.criado_em || '').localeCompare(String(a.criado_em || ''))
      if (porData !== 0) return porData
      const na = a.ia_nota ?? -1
      const nb = b.ia_nota ?? -1
      return nb - na
    })
    return out
  }, [itens, filtroStatus, busca, soQuentes, filtroVendedor, filtroOrigem])

  // 17/11: opções da barra de filtros, tiradas da própria base
  const vendedoresFiltro = useMemo(() => {
    const m: Record<string, { id: string; nome: string; total: number }> = {}
    for (const l of itens) {
      const id = l.owner_id || ''
      if (id === '') continue
      if (!m[id]) m[id] = { id, nome: l.owner_nome || l.vendedor_nome || 'Sem nome', total: 0 }
      m[id].total++
    }
    return Object.values(m).sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'))
  }, [itens])
  const semDonoTotal = useMemo(() => itens.filter((l) => !l.owner_id).length, [itens])
  const origensFiltro = useMemo(() => {
    const s = new Set<string>()
    for (const l of itens) if (l.origem) s.add(l.origem)
    return Array.from(s).sort()
  }, [itens])
  const temFiltro =
    busca !== '' ||
    filtroVendedor !== 'todos' ||
    filtroStatus !== 'todos' ||
    filtroOrigem !== 'todos' ||
    soQuentes

  /** Quantas páginas a lista filtrada tem (mínimo 1, para a tabela não sumir). */
  const totalPaginas = useMemo(
    () => Math.max(1, Math.ceil(filtrados.length / TAMANHO_PAGINA)),
    [filtrados.length],
  )

  /** Só a página atual vai para o DOM — o resto da base fica fora da tela. */
  const paginaAtual = useMemo(
    () => filtrados.slice(pagina * TAMANHO_PAGINA, (pagina + 1) * TAMANHO_PAGINA),
    [filtrados, pagina],
  )

  // filtro ou busca mudou: volta para a primeira página, senão a pessoa fica
  // numa página vazia (ex.: estava na 40 e o filtro deixou 3 resultados)
  useEffect(() => {
    setPagina(0)
  }, [filtroStatus, busca, filtroVendedor, filtroOrigem, soQuentes])

  // a lista encolheu (lead virou outro status, importação recarregou): se a
  // página atual deixou de existir, recua para a última válida
  useEffect(() => {
    if (pagina > totalPaginas - 1) setPagina(totalPaginas - 1)
  }, [pagina, totalPaginas])

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

  /** Transfere o lead para um vendedor pelo rodízio (SPEC-3-005, RN-67). */
  const transferir = async () => {
    if (!detalhe) return
    setTransferindo(true)
    setTransfErro('')
    setTransf(null)
    try {
      type R = { vendedor_nome?: string; regra?: string; estado?: string; detalhe?: string }
      type H = {
        itens?: Array<{ envios?: Array<{ motivo: string; modo: string; estado: string }> }>
      }
      const r = (await pb.send('/backend/v1/whatsapp/leads/' + detalhe.id + '/transferir', {
        method: 'POST',
        body: { motivo: 'primeiro_contato' },
      })) as R
      const h = (await pb.send('/backend/v1/whatsapp/leads/' + detalhe.id + '/transferencias', {
        method: 'GET',
      })) as H
      const primeiro = (h.itens || [])[0]
      const envs = (primeiro && primeiro.envios) || []
      setTransf({
        vendedor_nome: r.vendedor_nome || '—',
        regra: r.regra || '—',
        estado: r.estado || '—',
        detalhe: r.detalhe || '',
        envios: envs.map((e) => ({ motivo: e.motivo, modo: e.modo, estado: e.estado })),
      })
      await carregar()
    } catch (e) {
      setTransfErro(e instanceof Error ? e.message : String(e))
    } finally {
      setTransferindo(false)
    }
  }

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
    // trava do CA-3-72: descartar sem motivo não passa
    if (novoStatus === 'descartado' && motivoPerda.trim() === '') {
      setMsg('Informe o motivo do descarte para salvar.')
      return
    }
    setSalvando(true)
    try {
      const patch: Record<string, string> = { status: novoStatus }
      if (novoStatus === 'descartado') patch.motivo_perda = motivoPerda.trim()
      await editarLead(detalhe.id, patch)
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

  /** Mensagem de erro legível vinda do backend (erro/detalhe). */
  const erroLegivel = (e: unknown): string => {
    const d = (
      e as {
        response?: { erro?: string; detalhe?: string; data?: { erro?: string; detalhe?: string } }
      }
    )?.response
    const corpo = d?.data || d
    if (corpo && (corpo.detalhe || corpo.erro)) return String(corpo.detalhe || corpo.erro)
    return e instanceof Error ? e.message : String(e)
  }

  /** 17/11: corrige o nome do cliente e o valor da venda pela ficha. */
  const salvarDados = async () => {
    if (!detalhe) return
    const dados: { nome?: string; valor?: number } = {}
    const nomeLimpo = editNome.trim()
    if (nomeLimpo !== '' && nomeLimpo !== (detalhe.nome || '')) dados.nome = nomeLimpo
    const vTxt = editValor.trim()
    if (vTxt !== '') {
      const normal = vTxt.indexOf(',') >= 0 ? vTxt.replace(/\./g, '').replace(',', '.') : vTxt
      const v = Number(normal.replace(/[^0-9.]/g, ''))
      if (!Number.isFinite(v) || v < 0) {
        setMsg('Valor inválido. Use, por exemplo, 3.790,00')
        return
      }
      if (v !== Number(detalhe.valor || 0)) dados.valor = v
    }
    if (dados.nome === undefined && dados.valor === undefined) {
      setMsg('Nada para salvar.')
      return
    }
    setSalvandoDados(true)
    try {
      await pb.send('/backend/v1/crm/leads/' + detalhe.id, { method: 'PATCH', body: dados })
      setMsg('Dados do cliente salvos.')
      await carregar()
      setDetalhe({
        ...detalhe,
        nome: dados.nome !== undefined ? dados.nome : detalhe.nome,
        valor: dados.valor !== undefined ? dados.valor : detalhe.valor,
      })
      setEventos(await eventosDoLead(detalhe.id))
    } catch (e) {
      setMsg(erroLegivel(e))
    } finally {
      setSalvandoDados(false)
    }
  }

  /** 17/11: passa o lead para o vendedor escolhido (sai da carteira do antigo). */
  const trocarVendedor = async () => {
    if (!detalhe || novoDono === '') return
    setTrocando(true)
    try {
      const destinoId = novoDono === '__sem_dono__' ? '' : novoDono
      await pb.send('/backend/v1/crm/leads/' + detalhe.id, {
        method: 'PATCH',
        body: { owner_id: destinoId },
      })
      const v = vendedoresLista.find((x) => x.id === destinoId)
      setMsg(v ? 'Lead passado para ' + v.nome + '.' : 'Lead ficou sem dono.')
      await carregar()
      setDetalhe({ ...detalhe, owner_id: destinoId, owner_nome: v ? v.nome : '' })
      setNovoDono('')
      setEventos(await eventosDoLead(detalhe.id))
    } catch (e) {
      setMsg(erroLegivel(e))
    } finally {
      setTrocando(false)
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
      <CabecalhoTela
        titulo="Leads"
        subtitulo="Base própria de leads — origem, pipeline de status e trilha de eventos."
      />

      {/* alternância Lista | Funil */}
      {/* RN-203 item 2: alternância vira pílulas segmentadas */}
      <PilulasFiltro
        rotulo="Vista"
        valor={vista}
        aoTrocar={(v) => setVista(v as 'lista' | 'funil')}
        opcoes={[
          { valor: 'lista', rotulo: 'Lista' },
          { valor: 'funil', rotulo: 'Funil de vendas' },
        ]}
      />

      {/* dashboard (receita, ticket, taxa, lead time) — inspirado no CRM atual */}
      {dash && (
        <div className="space-y-3">
          {/* RN-203 item 3: o 1º indicador vira o número grande; os próximos
              (até 4) vão para o rodapé do cartão. Mesmos números de antes. */}
          <CartaoDestaque
            rotulo="Receita ganha"
            valor={'R$ ' + dash.receita.ganha.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
            apoio={dash.receita.n_conversoes + ' conversão(ões)'}
            itens={[
              {
                rotulo: 'Ticket médio',
                valor:
                  dash.ticket_medio === null
                    ? '—'
                    : 'R$ ' +
                      dash.ticket_medio.toLocaleString('pt-BR', { minimumFractionDigits: 2 }),
              },
              {
                rotulo: 'Taxa de conversão',
                valor: dash.taxa_conversao === null ? '—' : dash.taxa_conversao + '%',
              },
              { rotulo: 'Pipeline em aberto', valor: String(dash.receita.em_aberto) },
              {
                rotulo: 'Lead time (venda)',
                valor: dash.lead_time.media === null ? '—' : dash.lead_time.media + ' dias',
              },
            ]}
          />
        </div>
      )}

      {msg && (
        <p className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 text-sm text-foreground">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-marca-1" aria-hidden="true" />
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
      {/* 17/11: BARRA DE FILTROS — busca + vendedor + etapa + origem + quentes.
          Vale para a Lista e para o Funil. Os campos existiam no código mas
          tinham sumido da tela na troca do visual. */}
      {!carregando && !erro && itens.length > 0 && (
        <div className="flex flex-wrap items-end gap-2 rounded-cartao border bg-card p-3">
          <div className="min-w-[220px] flex-1 space-y-1">
            <Label className="text-xs">Buscar</Label>
            <Input
              value={busca}
              onChange={(e) => setBusca(e.target.value)}
              placeholder="Nome, telefone ou e-mail"
              className="h-9 bg-background"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Vendedor</Label>
            <Select value={filtroVendedor} onValueChange={setFiltroVendedor}>
              <SelectTrigger className="h-9 w-[220px] bg-background">
                <SelectValue placeholder="Todos os vendedores" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todos os vendedores</SelectItem>
                {vendedoresFiltro.map((v) => (
                  <SelectItem key={v.id} value={v.id}>
                    {v.nome} ({v.total})
                  </SelectItem>
                ))}
                {semDonoTotal > 0 && (
                  <SelectItem value="__sem_dono__">Sem dono ({semDonoTotal})</SelectItem>
                )}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Etapa</Label>
            <Select value={filtroStatus} onValueChange={setFiltroStatus}>
              <SelectTrigger className="h-9 w-[200px] bg-background">
                <SelectValue placeholder="Todas as etapas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as etapas</SelectItem>
                {STATUS_LEADS.map((s) => (
                  <SelectItem key={s.valor} value={s.valor}>
                    {s.rotulo}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">Origem</Label>
            <Select value={filtroOrigem} onValueChange={setFiltroOrigem}>
              <SelectTrigger className="h-9 w-[160px] bg-background">
                <SelectValue placeholder="Todas" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="todos">Todas as origens</SelectItem>
                {origensFiltro.map((o) => (
                  <SelectItem key={o} value={o}>
                    {ROTULO_ORIGEM[o] || o}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <Button
            size="sm"
            variant={soQuentes ? 'default' : 'outline'}
            className="h-9"
            onClick={() => setSoQuentes(!soQuentes)}
          >
            Só quentes (nota 60+)
          </Button>
          {temFiltro && (
            <Button
              size="sm"
              variant="ghost"
              className="h-9"
              onClick={() => {
                setBusca('')
                setFiltroVendedor('todos')
                setFiltroStatus('todos')
                setFiltroOrigem('todos')
                setSoQuentes(false)
              }}
            >
              Limpar filtros
            </Button>
          )}
          <p className="w-full text-xs text-muted-foreground">
            {filtrados.length} de {itens.length} leads
          </p>
        </div>
      )}

      {/* FUNIL DE VENDAS (kanban por status) */}
      {!carregando && !erro && itens.length > 0 && vista === 'funil' && (
        <div
          className="grid gap-3 overflow-x-auto pb-2"
          style={{ gridTemplateColumns: 'repeat(10, minmax(200px, 1fr))' }}
        >
          {STATUS_LEADS.map((s) => {
            // 17/11: o funil respeita a barra de filtros (vendedor, busca, origem)
            const coluna = filtrados.filter((l) => l.status === s.valor)
            // valor somado da coluna — só conta o que tem venda registrada
            const valorColuna = coluna.reduce((acc, l) => acc + Number(l.valor || 0), 0)
            // SPEC-3-018 RN-203 item 10: a coluna é um contêiner --muted
            // arredondado. A cor do estado NÃO pinta a coluna inteira — ela
            // vira o PONTO do chip de etapa, com o nome sempre em texto
            // (o estado nunca é mostrado só pela cor).
            const corPonto =
              s.cor === 'verde'
                ? 'hsl(var(--destaque-escuro))'
                : s.cor === 'vermelho'
                  ? 'hsl(var(--muted-foreground) / 0.45)'
                  : 'hsl(var(--muted-foreground))'
            return (
              <div key={s.valor} className="rounded-cartao bg-muted p-2">
                <p className="mb-1 flex items-start justify-between gap-1 px-1 text-xs font-semibold leading-tight">
                  <span className="flex flex-1 items-center gap-1.5">
                    <span
                      className="h-1.5 w-1.5 shrink-0 rounded-full"
                      style={{ backgroundColor: corPonto }}
                      aria-hidden="true"
                    />
                    {s.rotulo}
                  </span>
                  <span className="shrink-0 rounded-full bg-card px-1.5 py-0.5 text-xs tabular-nums text-muted-foreground">
                    {coluna.length}
                  </span>
                </p>
                <p className="mb-2 px-1 text-xs tabular-nums text-muted-foreground">
                  {valorColuna > 0
                    ? 'R$ ' + valorColuna.toLocaleString('pt-BR', { minimumFractionDigits: 2 })
                    : 'R$ 0,00'}
                </p>
                <div className="space-y-2">
                  {coluna.length === 0 && (
                    <p className="px-1 py-3 text-center text-xs text-muted-foreground">vazio</p>
                  )}
                  {coluna.slice(0, LIMITE_COLUNA).map((l) => (
                    <div key={l.id} className="rounded-md border bg-card p-2">
                      <div className="flex items-center justify-between gap-1">
                        <p className="truncate text-sm font-medium">{l.nome}</p>
                        <span
                          className={
                            'shrink-0 rounded-full px-1.5 py-0.5 text-xs font-medium tabular-nums ' +
                            corNota(l.ia_nota)
                          }
                          title={
                            l.ia_justificativa ||
                            'Nota da IA pela conversa (0 a 100). Sem nota = conversa ainda não analisada.'
                          }
                        >
                          {rotuloNota(l.ia_nota)}
                        </span>
                      </div>
                      <p className="text-xs tabular-nums text-muted-foreground">
                        R${' '}
                        {Number(l.valor || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                      </p>
                      <p className="truncate text-xs text-muted-foreground">
                        {l.telefone || l.email || '—'}
                      </p>
                      {l.ia_humor && (
                        <span
                          className={
                            'mt-0.5 inline-block rounded-full px-1.5 py-0.5 text-xs ' +
                            (COR_HUMOR[l.ia_humor] || 'bg-muted text-muted-foreground')
                          }
                          title="Humor da última mensagem do cliente"
                        >
                          {l.ia_humor}
                        </span>
                      )}
                      {l.owner_nome && (
                        <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-muted-foreground">
                          <User className="h-3 w-3 shrink-0" aria-hidden="true" />
                          <span className="truncate">{l.owner_nome}</span>
                        </p>
                      )}
                      <p className="mt-0.5 truncate text-xs text-muted-foreground">
                        {(l.data_lead || l.criado_em || '')
                          .slice(0, 10)
                          .split('-')
                          .reverse()
                          .join('/')}
                        {l.atualizado_em
                          ? ' · etapa ' +
                            l.atualizado_em.slice(0, 10).split('-').reverse().join('/')
                          : ''}
                      </p>
                      <div className="mt-1.5 flex items-center gap-1">
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs"
                          disabled={STATUS_LEADS[0].valor === s.valor}
                          onClick={() => void moverNoFunil(l, 'voltar')}
                        >
                          ←
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-xs"
                          disabled={STATUS_LEADS[STATUS_LEADS.length - 1].valor === s.valor}
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
                  {coluna.length > LIMITE_COLUNA && (
                    <p className="px-1 py-2 text-center text-xs text-muted-foreground">
                      + {coluna.length - LIMITE_COLUNA} não exibidos — use a vista Lista (com busca)
                      para chegar neles
                    </p>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* LISTA em BLOCOS (30/10) — o CRM antigo da agência mostrava cards,
          não tabela. Mesmos dados, apresentação em blocos: um card por lead,
          com nome, telefone, valor, origem, etapa e responsável. */}
      {!carregando && !erro && itens.length > 0 && vista === 'lista' && (
        <>
          {filtrados.length === 0 && (
            <Card>
              <CardContent className="pt-6">
                <p className="py-6 text-center text-sm text-muted-foreground">
                  Nenhum lead com esse filtro.
                </p>
              </CardContent>
            </Card>
          )}

          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {paginaAtual.map((l) => {
              const valor = Number(l.valor || 0)
              return (
                <div
                  key={l.id}
                  className="flex flex-col rounded-lead border border-border bg-card p-3 transition-colors hover:border-foreground/20"
                >
                  {/* cabeçalho do bloco: nome + etapa */}
                  <div className="flex items-start justify-between gap-2">
                    <p
                      className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground"
                      title={l.nome}
                    >
                      {l.nome}
                    </p>
                    <Badge className={'shrink-0 text-xs ' + (COR_STATUS[l.status] || '')}>
                      {ROTULO_STATUS[l.status] || l.status}
                    </Badge>
                  </div>

                  {/* nota da IA em destaque: é o que diz quem atacar primeiro */}
                  <div className="mt-1 flex items-center gap-2">
                    <span
                      className={
                        'rounded-full px-2 py-0.5 text-sm font-semibold tabular-nums ' +
                        corNota(l.ia_nota)
                      }
                      title={
                        l.ia_justificativa ||
                        'Nota da IA pela conversa (0 a 100). — = conversa ainda não analisada.'
                      }
                    >
                      {rotuloNota(l.ia_nota)}
                    </span>
                    {l.ia_humor && (
                      <span
                        className={
                          'rounded-full px-1.5 py-0.5 text-xs ' +
                          (COR_HUMOR[l.ia_humor] || 'bg-muted text-muted-foreground')
                        }
                      >
                        {l.ia_humor}
                      </span>
                    )}
                    <span className="ml-auto text-base font-semibold tabular-nums text-foreground">
                      R$ {valor.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                    </span>
                  </div>
                  {l.ia_resumo && (
                    <p
                      className="mt-1 line-clamp-2 text-xs leading-snug text-muted-foreground"
                      title={l.ia_resumo}
                    >
                      {l.ia_resumo}
                    </p>
                  )}

                  {/* telefone com atalho de WhatsApp */}
                  <div className="mt-1 space-y-0.5 text-xs text-muted-foreground">
                    <p className="flex items-center gap-1.5 truncate">
                      <Phone className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="truncate">{l.telefone || l.email || '—'}</span>
                    </p>
                    <p className="truncate">
                      {ROTULO_ORIGEM[l.origem] || l.origem}
                      {l.campanha ? ' · ' + l.campanha : ''}
                    </p>
                    <p className="flex items-center gap-1.5 truncate">
                      <Calendar className="h-3 w-3 shrink-0" aria-hidden="true" />
                      {(l.data_lead || l.criado_em || '')
                        .slice(0, 10)
                        .split('-')
                        .reverse()
                        .join('/') || '—'}
                    </p>
                  </div>

                  {/* responsável */}
                  <div className="mt-2 flex items-center justify-between gap-2 border-t border-border/60 pt-2">
                    <p className="flex min-w-0 flex-1 items-center gap-1.5 truncate text-xs text-muted-foreground">
                      <User className="h-3 w-3 shrink-0" aria-hidden="true" />
                      <span className="truncate text-foreground">{l.owner_nome || '—'}</span>
                    </p>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 shrink-0 px-2 text-xs"
                      onClick={() => void abrirDetalhe(l)}
                    >
                      Abrir
                    </Button>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* PAGINAÇÃO (volta após os blocos — a tabela antiga trazia junto) */}
      {!carregando && !erro && itens.length > 0 && vista === 'lista' && totalPaginas > 1 && (
        <div className="flex items-center justify-center gap-3 pt-1">
          <Button
            size="sm"
            variant="outline"
            disabled={pagina === 0}
            onClick={() => setPagina((p) => Math.max(0, p - 1))}
          >
            ← anterior
          </Button>
          <span className="text-xs tabular-nums text-muted-foreground">
            {pagina + 1} / {totalPaginas} · {filtrados.length} leads
          </span>
          <Button
            size="sm"
            variant="outline"
            disabled={pagina >= totalPaginas - 1}
            onClick={() => setPagina((p) => Math.min(totalPaginas - 1, p + 1))}
          >
            próxima →
          </Button>
        </div>
      )}

      {/* criar */}
      <Dialog open={abrirCriar} onOpenChange={setAbrirCriar}>
        <DialogContent className="rounded-janela shadow-janela">
          <DialogHeader>
            <DialogTitle className="text-janela">Novo lead</DialogTitle>
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
        {/* 17/11: a janela estourava para a direita — o link wa.me/... das
            mensagens do robô é uma "palavra" sem espaço e alargava tudo.
            Agora: mais larga, rola só na vertical e quebra texto longo. */}
        <DialogContent className="max-h-[90vh] w-[95vw] max-w-2xl overflow-y-auto overflow-x-hidden rounded-janela shadow-janela">
          <DialogHeader>
            <DialogTitle className="text-janela">{detalhe?.nome}</DialogTitle>
          </DialogHeader>
          {detalhe && (
            <div className="min-w-0 space-y-4 [overflow-wrap:anywhere]">
              <div className="grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
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
              {/* 17/11: dados do cliente — nome e valor da venda editáveis pelo dono do lead */}
              <div className="rounded-md border p-3">
                <p className="mb-2 text-sm font-medium">Dados do cliente</p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_160px_auto] sm:items-end">
                  <div className="space-y-1">
                    <Label className="text-xs">Nome do cliente</Label>
                    <Input
                      value={editNome}
                      onChange={(e) => setEditNome(e.target.value)}
                      placeholder="Nome completo"
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs">Valor da venda (R$)</Label>
                    <Input
                      value={editValor}
                      onChange={(e) => setEditValor(e.target.value)}
                      placeholder="0,00"
                      inputMode="decimal"
                    />
                  </div>
                  <Button onClick={() => void salvarDados()} disabled={salvandoDados}>
                    {salvandoDados ? 'Salvando…' : 'Salvar dados'}
                  </Button>
                </div>
              </div>
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
              {/* CA-3-72: motivo obrigatório ao descartar */}
              {novoStatus === 'descartado' && (
                <div className="space-y-1">
                  <Label>Motivo do descarte</Label>
                  <Input
                    value={motivoPerda}
                    onChange={(e) => setMotivoPerda(e.target.value)}
                    placeholder="Ex.: sem perfil, número errado, pediu para não receber"
                  />
                  <p className="text-xs text-muted-foreground">
                    O motivo fica gravado na trilha do lead.
                  </p>
                </div>
              )}
              {msg && <p className="text-sm text-muted-foreground">{msg}</p>}
              {/* WhatsApp como canal de venda (fase 4, card 2) */}
              <div className="flex flex-wrap items-center gap-2 rounded-md border bg-muted/40 px-3 py-2">
                <span className="text-sm text-muted-foreground">Venda:</span>
                {linkWhatsapp(detalhe.telefone) && (
                  <a
                    href={linkWhatsapp(detalhe.telefone) as string}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
                  >
                    Abrir no WhatsApp ↗
                  </a>
                )}
                {/* CA-3-45 (05/11): abre o WhatsApp DA VENDEDORA na conversa com
                    o cliente, já com a mensagem escrita. Sem custo: sai pelo
                    aplicativo, não pela API. */}
                {linkChamarWhatsapp(detalhe.telefone) && (
                  <a
                    href={linkChamarWhatsapp(detalhe.telefone) as string}
                    target="_blank"
                    rel="noreferrer"
                    className="rounded-full border border-border bg-card px-3 py-1.5 text-sm font-medium text-foreground hover:bg-muted"
                  >
                    Chamar no WhatsApp
                  </a>
                )}
                {detalhe.status !== 'fechado' && (
                  <Button size="sm" onClick={abrirConversao}>
                    Registrar conversão
                  </Button>
                )}
              </div>
              {/* Transferência para vendedor (SPEC-3-005, CA-3-16) */}
              <div className="rounded-md border p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-medium">Atendimento</p>
                    <p className="text-xs text-muted-foreground">
                      {detalhe.owner_nome
                        ? 'Responsável: ' + detalhe.owner_nome
                        : 'Sem responsável — a transferência usa o rodízio'}
                    </p>
                  </div>
                  {/* 17/11: trocar vendedor escolhendo o nome (pedido da Anézia) */}
                  <div className="flex flex-wrap items-center gap-2">
                    <Select value={novoDono} onValueChange={setNovoDono}>
                      <SelectTrigger className="h-9 w-[200px]">
                        <SelectValue placeholder="Trocar vendedor…" />
                      </SelectTrigger>
                      <SelectContent>
                        {vendedoresLista
                          .filter((v) => v.id !== detalhe.owner_id)
                          .map((v) => (
                            <SelectItem key={v.id} value={v.id}>
                              {v.nome}
                            </SelectItem>
                          ))}
                        {detalhe.owner_id && (
                          <SelectItem value="__sem_dono__">Deixar sem dono</SelectItem>
                        )}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      onClick={() => void trocarVendedor()}
                      disabled={trocando || novoDono === ''}
                    >
                      {trocando ? 'Trocando…' : 'Trocar'}
                    </Button>
                    {!detalhe.owner_id && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => void transferir()}
                        disabled={transferindo}
                      >
                        {transferindo ? 'Distribuindo…' : 'Distribuir pelo rodízio'}
                      </Button>
                    )}
                  </div>
                </div>
                {transfErro && <p className="mt-2 text-xs text-destructive">{transfErro}</p>}
                {transf && (
                  <div className="mt-2 space-y-1 text-xs">
                    <p>
                      <span className="text-muted-foreground">Vendedor:</span>{' '}
                      <span className="font-medium">{transf.vendedor_nome}</span>{' '}
                      <span className="text-muted-foreground">({transf.regra})</span>
                    </p>
                    <p>
                      <span className="text-muted-foreground">Estado:</span> {transf.estado}
                      {transf.detalhe ? ' — ' + transf.detalhe : ''}
                    </p>
                    {transf.envios.map((e, i) => (
                      <p key={i} className="text-muted-foreground">
                        {e.motivo === 'aviso_vendedor' ? 'Aviso ao vendedor' : 'Aviso ao cliente'}:{' '}
                        {e.modo} · {e.estado}
                      </p>
                    ))}
                    {transf.envios.length === 0 && (
                      <p className="text-muted-foreground">Nenhum aviso enfileirado.</p>
                    )}
                  </div>
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
                            'min-w-0 rounded-md px-3 py-2 text-sm [overflow-wrap:anywhere] ' +
                            (msg.autor === 'cliente' ? 'bg-muted/60' : 'ml-6 bg-accent')
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
                              {msg.texto && (
                                <p className="whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                                  {msg.texto}
                                </p>
                              )}
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
