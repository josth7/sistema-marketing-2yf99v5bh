/**
 * Serviço de acessos do frontend (SPEC-2-005, card 5b1de184).
 * Lê /me (permissões do próprio usuário) e a lista de métricas COM ESCOPO
 * aplicado no servidor (rota /backend/v1/metricas — guard read_metrics).
 * AP-2026-10-14-1425: erros das rotas custom são lidos pelo contrato
 * {ok:false, erro, campos, detalhe} — nunca mensagem genérica.
 */
import pb from '@/lib/pocketbase/client'
import { lerErroCustom } from '@/lib/marketing/erros-custom'
import type { MetricaDiariaRecord } from '@/lib/marketing/ingestao'

export interface MeusAcessos {
  ok: boolean
  email?: string
  grants?: Array<{
    id: string
    role: string
    actions: string[]
    valid_from: string | null
    valid_until: string | null
    version: number
    note: string | null
  }>
  actions?: string[]
}

/** Permissões do usuário logado (vazio/negado quando sem grant). */
export async function meusAcessos(): Promise<MeusAcessos> {
  try {
    return (await pb.send('/backend/v1/acessos/me', { method: 'GET' })) as MeusAcessos
  } catch {
    return { ok: false, actions: [] }
  }
}

export type RespostaMetricas =
  | {
      ok: true
      escopo: { contas: string[]; canais: string[] }
      total: number
      itens: MetricaDiariaRecord[]
    }
  | { ok: false; erro: string; status: number }

/** Métricas com escopo do ator aplicado NO SERVIDOR (403 sem read_metrics). */
export async function carregarMetricasComEscopo(): Promise<RespostaMetricas> {
  try {
    const res = (await pb.send('/backend/v1/metricas', { method: 'GET' })) as {
      ok?: boolean
      escopo?: { contas: string[]; canais: string[] }
      total?: number
      itens?: MetricaDiariaRecord[]
      erro?: string
    }
    if (res && res.ok && Array.isArray(res.itens)) {
      return {
        ok: true,
        escopo: res.escopo ?? { contas: ['*'], canais: ['*'] },
        total: res.total ?? res.itens.length,
        itens: res.itens,
      }
    }
    return { ok: false, erro: (res && res.erro) || 'resposta inválida do servidor', status: 200 }
  } catch (e) {
    return { ok: false, erro: lerErroCustom(e), status: 403 }
  }
}
