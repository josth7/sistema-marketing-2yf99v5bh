/**
 * Serviço de alertas (SPEC-2-002, card f7591165, CA-2-06/07).
 * Erros em PT-BR lendo o corpo do SDK PocketBase v0.26:
 * e.response?.data ?? e.response ?? e.data (AP-2026-10-09-1700).
 */
import pb from '@/lib/pocketbase/client'

export interface AlertaItem {
  id: string
  criterion_id: string
  criterion_uuid: string
  criterion_version: number
  group_key: string
  metric: string
  canal: string
  objetivo: string
  result_type: string | null
  natureza: string
  direction: string
  period_kind: string
  period_current_start: string
  period_current_end: string
  period_prev_start: string
  period_prev_end: string
  current_value: number | null
  previous_value: number | null
  variation_pct: number | null
  trigger_summary: string
  responsible_email: string | null
  decision_id: string | null
  state: 'open' | 'in_review' | 'decided' | 'closed'
  history: string | null
  created: string
  updated: string
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

export async function listarAlertas(): Promise<AlertaItem[]> {
  try {
    const r = await pb.send('/backend/v1/alerts', { method: 'GET' })
    return (r as { itens: AlertaItem[] }).itens || []
  } catch (e) {
    throw new Error(mensagemErro(e))
  }
}

export async function transicionar(
  id: string,
  body: { state: string; decision_id?: string; justificativa?: string },
): Promise<{ state: string }> {
  try {
    const r = await pb.send('/backend/v1/alerts/' + id + '/state', {
      method: 'PATCH',
      body,
    })
    return r as { state: string }
  } catch (e) {
    throw new Error(mensagemErro(e))
  }
}

export async function tickTeste(data?: string): Promise<unknown> {
  try {
    const r = await pb.send('/backend/v1/alerts/tick', {
      method: 'POST',
      body: data ? { data } : {},
    })
    return r
  } catch (e) {
    throw new Error(mensagemErro(e))
  }
}

export function rotuloEstadoAlerta(estado: string): string {
  if (estado === 'in_review') return 'Em análise'
  if (estado === 'decided') return 'Decidido'
  if (estado === 'closed') return 'Encerrado'
  return 'Aberto'
}

export function rotuloPeriodo(kind: string): string {
  return kind === 'monthly' ? 'Mensal' : 'Quinzenal (1–15 / 16–fim)'
}
