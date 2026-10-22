/**
 * Serviço de concorrentes (fase 4, card 4) — observações manuais.
 */
import pb from '@/lib/pocketbase/client'

export interface ObsConcorrente {
  id: string
  concorrente: string
  data_obs: string
  tipo: 'preco' | 'lancamento' | 'promocao' | 'produto' | 'outro'
  texto: string
  canal_visto: string
  user_id: string
  criado_em: string
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

export const TIPOS_OBS = [
  { valor: 'preco', rotulo: 'Preço' },
  { valor: 'lancamento', rotulo: 'Lançamento' },
  { valor: 'promocao', rotulo: 'Promoção' },
  { valor: 'produto', rotulo: 'Produto' },
  { valor: 'outro', rotulo: 'Outro' },
] as const

export const CONCORRENTES_FIXOS = [
  'Van De Velde',
  'Ferrante',
  'Kixiki',
  'Web Cadeiras',
  'SB Móveis',
] as const

export async function listarObs(): Promise<ObsConcorrente[]> {
  try {
    const r = await pb.send('/backend/v1/concorrentes/obs', { method: 'GET' })
    return (r as { ok: boolean; itens: ObsConcorrente[] }).itens || []
  } catch (e) {
    throw new Error(mensagemErro(e))
  }
}

export async function criarObs(dados: {
  concorrente: string
  tipo?: string
  texto?: string
  canal_visto?: string
  data_obs?: string
}): Promise<{ id: string }> {
  try {
    const r = await pb.send('/backend/v1/concorrentes/obs', { method: 'POST', body: dados })
    return r as { id: string }
  } catch (e) {
    throw new Error(mensagemErro(e))
  }
}
