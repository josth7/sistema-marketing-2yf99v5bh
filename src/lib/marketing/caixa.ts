/**
 * Serviço da caixa de entrada (SPEC-2-004, card a70d5ab8, CA-2-11).
 *
 * Erros em PT-BR lendo o corpo do SDK PocketBase v0.26:
 * e.response?.data ?? e.response ?? e.data (AP-2026-10-09-1700).
 */
import pb from '@/lib/pocketbase/client'

export interface ItemCaixa {
  id: string
  tipo?: 'relatorio' | 'lembrete' | 'cancelled'
  report_id: string
  relatorio: {
    id: string
    period_start: string
    period_end: string
    quinzena: number
    state: string
    template_version: string
    report_revision: number
    warnings: unknown
  } | null
  decisao?: {
    id: string
    title: string
    review_date: string | null
    state: string
    revision: number
  } | null
  scope: string | null
  status: string
  attempts: number
  delivered_at: string | null
  read_at: string | null
  created: string
}

function mensagemErro(e: unknown): string {
  const err = e as {
    response?: { data?: unknown; erro?: string }
    data?: unknown
    message?: string
  }
  const corpo = err?.response?.data ?? err?.response ?? err?.data
  if (corpo && typeof corpo === 'object' && 'erro' in (corpo as Record<string, unknown>)) {
    return String((corpo as Record<string, unknown>).erro)
  }
  if (typeof corpo === 'string') return corpo
  return err?.message || 'não foi possível completar a operação'
}

export async function listarCaixa(): Promise<ItemCaixa[]> {
  try {
    const r = await pb.send('/backend/v1/inbox', { method: 'GET' })
    return (r as { ok: boolean; itens: ItemCaixa[] }).itens || []
  } catch (e) {
    throw new Error(mensagemErro(e))
  }
}

export async function marcarLida(
  id: string,
): Promise<{ read_at: string | null; ja_lida: boolean }> {
  try {
    const r = await pb.send('/backend/v1/inbox/' + id + '/read', { method: 'PATCH' })
    return {
      read_at: (r as { read_at: string | null }).read_at || null,
      ja_lida: Boolean((r as { ja_lida: boolean }).ja_lida),
    }
  } catch (e) {
    throw new Error(mensagemErro(e))
  }
}

export async function republicar(
  id: string,
  motivo: string,
  chave: string,
): Promise<{ id: string; report_revision: number; replay: boolean; aviso?: string }> {
  try {
    const r = await pb.send('/backend/v1/reports/' + id + '/republish', {
      method: 'POST',
      body: { revision_reason: motivo, idempotency_key: chave },
    })
    return r as { id: string; report_revision: number; replay: boolean; aviso?: string }
  } catch (e) {
    throw new Error(mensagemErro(e))
  }
}

export async function tickTeste(data?: string): Promise<unknown> {
  try {
    const r = await pb.send('/backend/v1/reports/tick', {
      method: 'POST',
      body: data ? { data: data } : {},
    })
    return r
  } catch (e) {
    throw new Error(mensagemErro(e))
  }
}
