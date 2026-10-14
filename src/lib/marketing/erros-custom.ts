/**
 * Lê o erro das rotas custom /backend/v1/ (contrato {ok:false, erro, campos}).
 *
 * AP-2026-10-09-1700: o SDK PocketBase v0.26 guarda o CORPO em e.response (alias e.data).
 * AP-2026-10-14-1400 (f9a2a3eb): getErrorMessage genérico não lia o campo "erro" do
 * contrato das rotas custom — o 403 aparecia sem justificativa ("não aprovou" sem o porquê).
 * Esta função cobre: corpo custom (erro/campos), validação nativa (data.campo.message)
 * e por fim a mensagem técnica do SDK.
 */
import { ClientResponseError } from 'pocketbase'

export interface ErroCustom {
  ok: boolean
  erro?: string
  campos?: Record<string, unknown>
}

/** Extrai a mensagem principal do corpo do erro (custom ou nativo). */
export function lerErroCustom(e: unknown): string {
  if (e instanceof ClientResponseError) {
    const corpo = (e.response ?? (e as unknown as { data?: ErroCustom }).data) as
      | (ErroCustom & { data?: Record<string, unknown> })
      | undefined
    if (corpo && typeof corpo === 'object') {
      // 1) contrato das rotas custom: {ok:false, erro:"..."}
      if (corpo.erro) return String(corpo.erro)
      // 2) validação nativa de coleção: {data:{campo:{message}}}
      const detail = corpo.data
      if (detail && typeof detail === 'object') {
        const msgs: string[] = []
        for (const [, det] of Object.entries(detail)) {
          if (det && typeof det === 'object' && 'message' in (det as Record<string, unknown>)) {
            msgs.push(String((det as { message: unknown }).message))
          }
        }
        if (msgs.length > 0) return msgs.join(' ')
      }
    }
    // 3) mensagem técnica do SDK como último recurso
    return e.message || 'não foi possível completar a operação'
  }
  return e instanceof Error ? e.message : 'não foi possível completar a operação'
}

/** Extrai erros por campo do corpo custom ({campos:{campo:"motivo"}}). */
export function camposErroCustom(e: unknown): Record<string, string> {
  if (!(e instanceof ClientResponseError)) return {}
  const corpo = (e.response ?? (e as unknown as { data?: ErroCustom }).data) as
    | (ErroCustom & { data?: Record<string, unknown> })
    | undefined
  const out: Record<string, string> = {}
  if (corpo?.campos && typeof corpo.campos === 'object') {
    for (const [campo, det] of Object.entries(corpo.campos)) {
      if (det && typeof det === 'object' && 'message' in (det as Record<string, unknown>)) {
        out[campo] = String((det as { message: unknown }).message)
      } else if (typeof det === 'string') {
        out[campo] = det
      }
    }
  }
  return out
}
