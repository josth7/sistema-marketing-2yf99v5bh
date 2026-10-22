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
  status: 'novo' | 'em_contato' | 'orcamento' | 'fechado' | 'perdido'
  observacoes: string
  owner_id: string
  conta_id: string
  criado_em: string
  atualizado_em: string
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

export const STATUS_LEADS = [
  { valor: 'novo', rotulo: 'Novo' },
  { valor: 'em_contato', rotulo: 'Em contato' },
  { valor: 'orcamento', rotulo: 'Orçamento' },
  { valor: 'fechado', rotulo: 'Fechado' },
  { valor: 'perdido', rotulo: 'Perdido' },
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
  dados: { status?: string; observacoes?: string },
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
