/**
 * Serviço do CRM (fase 4) — leads.
 * Erros em PT-BR lendo o corpo do SDK PocketBase v0.26 (padrão caixa.ts).
 */
import pb from '@/lib/pocketbase/client'

export interface Lead {
  id: string
  nome: string
  telefone: string
  email: string
  origem: string
  campanha: string
  data_lead: string
  status:
    | 'entrada_lead'
    | 'pre_atendimento_ia'
    | 'mql'
    | 'orcamento'
    | 'negociacao'
    | 'aguardando_pagamento'
    | 'venda_realizada'
    | 'producao'
    | 'finalizado'
    | 'descartado'
  observacoes: string
  owner_id: string
  owner_nome: string
  temperatura: 'neutro' | 'positivo' | 'frio'
  conta_id: string
  criado_em: string
  atualizado_em: string
  valor: number
  vendedor_nome: string
  // IA do lead (CA-3-23) — resumo, nota 0-100 e humor da conversa
  ia_nota: number | null
  ia_humor: string
  ia_resumo: string
  ia_justificativa: string
  ia_humor_score: number | null
  ia_calculado_em: string
}

export interface LeadEvento {
  id: string
  tipo: 'criado' | 'status' | 'nota' | 'conversao'
  texto: string
  user_id: string
  criado_em: string
}

export interface ResultadoImportacao {
  ok: boolean
  criados: number
  duplicados: number
  invalidos: number
  erros: string[]
}

function mensagemErro(e: unknown): string {
  const err = e as {
    response?: { data?: { erro?: string; detalhe?: string; campos?: Record<string, string> } }
    data?: { erro?: string; detalhe?: string; campos?: Record<string, string> }
    message?: string
  }
  const corpo = err?.response?.data ?? err?.data
  if (corpo && typeof corpo === 'object' && 'erro' in (corpo as Record<string, unknown>)) {
    const c = corpo as { erro: string; detalhe?: string }
    return c.detalhe ? `${c.erro} — ${c.detalhe}` : c.erro
  }
  if (typeof corpo === 'string') return corpo
  return err?.message || 'não foi possível completar a operação'
}

/**
 * Funil de 10 etapas — o mesmo do CRM antigo da Haisan (30/10).
 *
 * A ordem é a do fluxo real: o lead entra, a IA faz o pré-atendimento, vira
 * MQL quando o cliente responde, passa por orçamento e negociação, aguarda
 * pagamento, é venda realizada, vai para produção, finaliza. `descartado`
 * fica no fim porque é saída do funil.
 *
 * `cor` segue a leitura visual do CRM antigo: verde para venda, vermelho para
 * descarte, neutro no meio.
 */
export const STATUS_LEADS = [
  { valor: 'entrada_lead', rotulo: 'Entrada de lead', cor: 'neutro' },
  { valor: 'pre_atendimento_ia', rotulo: 'Pré-atendimento com IA', cor: 'neutro' },
  { valor: 'mql', rotulo: 'MQL (cliente respondeu)', cor: 'neutro' },
  { valor: 'orcamento', rotulo: 'Orçamento', cor: 'neutro' },
  { valor: 'negociacao', rotulo: 'Negociação', cor: 'neutro' },
  { valor: 'aguardando_pagamento', rotulo: 'Aguardando pagamento', cor: 'neutro' },
  { valor: 'venda_realizada', rotulo: 'Venda realizada', cor: 'verde' },
  { valor: 'producao', rotulo: 'Produção', cor: 'neutro' },
  { valor: 'finalizado', rotulo: 'Finalizado', cor: 'verde' },
  { valor: 'descartado', rotulo: 'Descartado', cor: 'vermelho' },
] as const

export const ORIGENS_LEADS = ['meta', 'google', 'site', 'whatsapp', 'manual', 'importacao'] as const

export async function listarLeads(): Promise<Lead[]> {
  try {
    const r = await pb.send('/backend/v1/crm/leads', { method: 'GET' })
    return (r as { ok: boolean; itens: Lead[] }).itens || []
  } catch (e) {
    throw new Error(mensagemErro(e))
  }
}

export async function criarLead(dados: {
  nome: string
  telefone?: string
  email?: string
  origem?: string
  campanha?: string
  data_lead?: string
  status?: string
  observacoes?: string
}): Promise<{ id: string }> {
  try {
    const r = await pb.send('/backend/v1/crm/leads', { method: 'POST', body: dados })
    return r as { id: string }
  } catch (e) {
    throw new Error(mensagemErro(e))
  }
}

export async function editarLead(
  id: string,
  dados: { status?: string; observacoes?: string; motivo_perda?: string; valor?: number },
): Promise<{ id: string; mudancas: number; sem_mudanca?: boolean }> {
  try {
    const r = await pb.send(`/backend/v1/crm/leads/${id}`, { method: 'PATCH', body: dados })
    return r as { id: string; mudancas: number; sem_mudanca?: boolean }
  } catch (e) {
    throw new Error(mensagemErro(e))
  }
}

export async function eventosDoLead(id: string): Promise<LeadEvento[]> {
  try {
    const r = await pb.send(`/backend/v1/crm/leads/${id}/eventos`, { method: 'GET' })
    return (r as { ok: boolean; itens: LeadEvento[] }).itens || []
  } catch (e) {
    throw new Error(mensagemErro(e))
  }
}

/** Dashboard do CRM (receita, ticket, taxa, lead time, estágios, responsáveis). */
export interface DashboardCrm {
  receita: { ganha: number; perdida: number; em_aberto: number; n_conversoes: number }
  ticket_medio: number | null
  taxa_conversao: number | null
  lead_time: {
    media: number | null
    mediana: number | null
    min: number | null
    max: number | null
    n: number
  }
  por_estagio: Record<string, number>
  por_origem: Record<string, number>
  criados_no_mes: number
  media_dia: number | null
  top_responsaveis: Array<{
    owner: string
    nome: string
    leads: number
    fechados: number
    valor: number
  }>
}

export async function dashboardCrm(): Promise<DashboardCrm> {
  try {
    const r = await pb.send('/backend/v1/crm/dashboard', { method: 'GET' })
    return r as DashboardCrm
  } catch (e) {
    throw new Error(mensagemErro(e))
  }
}

/** Resumo da fila de conversões (pendentes/enviadas/valor). */
export async function resumoConversoes(): Promise<{
  pendentes: number
  enviadas: number
  erros: number
  valor_pendente: number
  valor_enviado: number
}> {
  try {
    const r = await pb.send('/backend/v1/crm/conversoes/resumo', { method: 'GET' })
    return r as {
      pendentes: number
      enviadas: number
      erros: number
      valor_pendente: number
      valor_enviado: number
    }
  } catch (e) {
    throw new Error(mensagemErro(e))
  }
}

/** Registra uma conversão (venda) no lead — status vira "fechado". */
export async function registrarConversao(
  id: string,
  dados: { valor: number; canal?: string; descricao?: string },
): Promise<{ id: string; status: string }> {
  try {
    const r = await pb.send(`/backend/v1/crm/leads/${id}/conversao`, {
      method: 'POST',
      body: dados,
    })
    return r as { id: string; status: string }
  } catch (e) {
    throw new Error(mensagemErro(e))
  }
}

/** Link de WhatsApp (wa.me) com o telefone do lead (só números). */
export function linkWhatsapp(telefone: string): string | null {
  const digitos = telefone.replace(/\D/g, '')
  if (digitos.length < 10) return null
  // Brasil: DDD + número; wa.me espera 55 + DDD + número
  const comPais = digitos.startsWith('55') ? digitos : '55' + digitos
  return 'https://wa.me/' + comPais
}

/**
 * Link "Chamar no WhatsApp" (CA-3-45, 05/11).
 *
 * Diferente de `linkWhatsapp`, este leva a MENSAGEM PRONTA: a vendedora toca,
 * o aplicativo dela abre a conversa com o cliente já com o primeiro "oi"
 * escrito. Ela só confere e envia.
 *
 * Sem custo: a mensagem sai do aplicativo dela (WhatsApp Business do número
 * dela), não pela API — mensagem pelo aplicativo não é cobrada.
 *
 * `texto` opcional: quando vazio, usa o padrão de retomada da Haisan.
 */
export function linkChamarWhatsapp(telefone: string, texto?: string): string | null {
  const digitos = telefone.replace(/\D/g, '')
  if (digitos.length < 10) return null
  const comPais = digitos.startsWith('55') ? digitos : '55' + digitos
  const corpo =
    (texto || '').trim() !== ''
      ? (texto as string).trim()
      : 'Oi! Aqui é da Haisan. Vi que você falou com a gente — como posso te ajudar?'
  return 'https://wa.me/' + comPais + '?text=' + encodeURIComponent(corpo)
}

/** Importa leads colados em CSV (uma linha por lead; cabeçalho opcional). */
export async function importarLeadsCsv(csv: string): Promise<ResultadoImportacao> {
  const linhas = csv
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l !== '')
  if (linhas.length === 0) throw new Error('Cole o conteúdo da planilha (CSV) antes de importar.')
  // detecta cabeçalho: 1ª linha com "nome" e "telefone" → descarta
  const primeira = linhas[0].toLowerCase()
  const temCabecalho =
    primeira.includes('nome') && (primeira.includes('telefone') || primeira.includes('phone'))
  const linhasDados = temCabecalho ? linhas.slice(1) : linhas
  const leads = linhasDados.map((linha) => {
    // separa por ; ou , (planilha BR usa ;)
    const sep = linha.includes(';') ? ';' : ','
    const col = linha.split(sep).map((c) => c.trim().replace(/^"(.*)"$/, '$1'))
    return {
      nome: col[0] || '',
      telefone: col[1] || '',
      email: col[2] || '',
      origem: col[3] || 'importacao',
      campanha: col[4] || '',
      data_lead: col[5] || '',
      status: col[6] || 'novo',
      observacoes: col[7] || '',
    }
  })
  try {
    const r = await pb.send('/backend/v1/crm/leads/importar', {
      method: 'POST',
      body: { leads },
    })
    return r as ResultadoImportacao
  } catch (e) {
    throw new Error(mensagemErro(e))
  }
}

export type MensagemWhatsapp = {
  id: string
  autor: string
  autor_user: string
  direcao: string
  tipo: string
  texto: string
  texto_original: string
  media_url: string
  media_url_temporaria: boolean
  media_mimetype: string
  media_duracao_s: number
  media_ptt: boolean
  status: string
  enviada_em: string
  editada_em: string
  apagada: boolean
  numero: string
}

export type ConversaDoLead = {
  ok: boolean
  lead: string
  total: number
  conversas: number
  itens: MensagemWhatsapp[]
}

/**
 * Conversa do WhatsApp na ficha do lead (SPEC-3-005, CA-3-15).
 *
 * A rota decide no servidor o que este usuário pode ver (read_conversas +
 * acesso por número): sem permissão, devolve 403 e a tela mostra o aviso.
 */
export async function conversaDoLead(leadId: string): Promise<ConversaDoLead> {
  try {
    const r = await pb.send('/backend/v1/whatsapp/leads/' + leadId + '/conversa', { method: 'GET' })
    return r as ConversaDoLead
  } catch (e) {
    throw new Error(mensagemErro(e))
  }
}

/** Rótulo de quem mandou, na linguagem da tela. */
export function rotuloAutor(autor: string): string {
  const mapa: Record<string, string> = {
    cliente: 'Cliente',
    ia: 'IA',
    vendedor: 'Vendedor',
    equipe_central: 'Equipe da central',
    sistema: 'Sistema',
    api_externa: 'API externa',
  }
  return mapa[autor] || autor
}

/** Descrição curta da mídia (áudio com duração, imagem, documento). */
export function descricaoMidia(m: MensagemWhatsapp): string {
  if (!m.media_url) return ''
  const tipo = m.media_mimetype || ''
  if (m.tipo === 'audio') {
    const dur = Number(m.media_duracao_s || 0)
    const mm = Math.floor(dur / 60)
    const ss = String(Math.floor(dur % 60)).padStart(2, '0')
    return `Áudio ${mm}:${ss}`
  }
  if (tipo.indexOf('image') >= 0) return 'Imagem'
  if (tipo.indexOf('video') >= 0) return 'Vídeo'
  if (tipo.indexOf('audio') >= 0) return 'Áudio'
  return 'Documento'
}
