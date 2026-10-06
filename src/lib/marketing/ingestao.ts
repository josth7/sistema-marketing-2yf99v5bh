/**
 * Cliente de ingestão do painel (task ea514702).
 * Lê metricas_diarias + fontes_estado do PocketBase e converte para o
 * modelo do painel (RegistroMetricas). RN-06: campo ausente = null.
 */
import type { Canal, Natureza, ObjetivoCampanha, RegistroMetricas } from './types'

export interface MetricaDiariaRecord {
  id: string
  origem: string
  canal: string
  natureza: string
  conta_id: string
  conta_nome: string
  campanha_id: string
  campanha_nome: string
  objetivo: string
  data: string
  alcance: number | null
  impressoes: number | null
  cliques: number | null
  gasto: number | null
  resultados: number | null
  cpc: number | null
  cpm: number | null
  ctr: number | null
  updated: string
}

export interface FonteEstadoRecord {
  id: string
  canal: string
  estado: string
  aviso: string
  ultima_ingestao: string | null
}

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Normaliza a data do PocketBase ("2026-09-30 00:00:00.000Z") para yyyy-mm-dd. */
function dataSegura(v: string): string {
  return typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : ''
}

function objetivoSeguro(v: string): ObjetivoCampanha {
  const validos: ObjetivoCampanha[] = [
    'alcance',
    'trafico',
    'engajamento',
    'leads',
    'vendas',
    'video',
    'nao_informado',
  ]
  return validos.includes(v as ObjetivoCampanha) ? (v as ObjetivoCampanha) : 'nao_informado'
}

/** Converte registros do PocketBase para o modelo do painel. */
export function paraRegistroMetricas(r: MetricaDiariaRecord): RegistroMetricas {
  return {
    id: r.id,
    origem: (['api', 'csv', 'demonstracao'].includes(r.origem)
      ? r.origem
      : 'api') as RegistroMetricas['origem'],
    canal: r.canal as Canal,
    natureza: (r.natureza === 'organico' ? 'organico' : 'pago') as Natureza,
    contaId: r.conta_id || null,
    contaNome: r.conta_nome || null,
    campanhaId: r.campanha_id,
    campanhaNome: r.campanha_nome,
    objetivo: objetivoSeguro(r.objetivo),
    periodoInicio: dataSegura(r.data),
    periodoFim: dataSegura(r.data),
    metricas: {
      alcance: num(r.alcance),
      impressoes: num(r.impressoes),
      cliques: num(r.cliques),
      gasto: num(r.gasto),
      resultados: num(r.resultados),
      // ctr/cpc/cpm calculados na fonte: 0 gravado = "não calculado" (RN-06) —
      // vira null e a agregação deriva dos valores reais (cliques/impressões/gasto).
      cpc: num(r.cpc) === 0 ? null : num(r.cpc),
      cpm: num(r.cpm) === 0 ? null : num(r.cpm),
      ctr: num(r.ctr) === 0 ? null : num(r.ctr),
      custoPorResultado: null, // calculado na agregação (RN-01), nunca lido da fonte
    },
    atualizadoEm: r.updated,
  }
}

/** Busca as métricas diárias no PocketBase (origem api ou csv — demo é local). */
export async function carregarMetricasReais(
  baseUrl: string,
): Promise<{ registros: RegistroMetricas[]; erro: string | null }> {
  try {
    const res = await fetch(
      `${baseUrl}/api/collections/metricas_diarias/records?sort=-data&perPage=500`,
    )
    if (!res.ok) return { registros: [], erro: `PocketBase respondeu HTTP ${res.status}` }
    const json = (await res.json()) as { items?: MetricaDiariaRecord[] }
    const items = Array.isArray(json.items) ? json.items : []
    return { registros: items.map(paraRegistroMetricas), erro: null }
  } catch (e) {
    return { registros: [], erro: e instanceof Error ? e.message : 'falha ao carregar métricas' }
  }
}

/** Busca o estado das fontes (avisos e última ingestão). */
export async function carregarEstadoFontes(
  baseUrl: string,
): Promise<Record<string, FonteEstadoRecord>> {
  try {
    const res = await fetch(`${baseUrl}/api/collections/fontes_estado/records?perPage=10`)
    if (!res.ok) return {}
    const json = (await res.json()) as { items?: FonteEstadoRecord[] }
    const out: Record<string, FonteEstadoRecord> = {}
    for (const it of Array.isArray(json.items) ? json.items : []) {
      out[it.canal] = it
    }
    return out
  } catch {
    return {}
  }
}
