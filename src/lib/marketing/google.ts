/**
 * Adaptador Google Ads (task ea514702, SPEC-1-001).
 *
 * A leitura real do Google Ads exige credencial OAuth no SERVIDOR (o MCP/connector
 * roda fora do app). No app, este adaptador consome o endpoint interno /api/ingest
 * (hook do servidor Skip), que faz a chamada autenticada e grava no PocketBase.
 * O navegador NUNCA vê token.
 *
 * Contrato validado no baseline (30/09): 44 campanhas legíveis via relatório oficial.
 */

export interface GoogleCampaignRow {
  campanhaId: string
  campanhaNome: string
  status: string
  impressoes: number | null
  cliques: number | null
  gasto: number | null
  resultados: number | null
}

export interface IngestResult {
  ok: boolean
  ingested: number
  erro: string | null
  fonte: 'meta_ads' | 'google_ads' | 'meta_organico'
}

const TIMEOUT_MS = 15000

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  // Google retorna micros (cost_micros) — convertido no hook; aqui só saneia.
  return Number.isFinite(n) ? n : null
}

/** Parse do relatório de campanhas do Google (formato do servidor). */
export function parseGoogleCampaigns(json: unknown): GoogleCampaignRow[] {
  const rows: GoogleCampaignRow[] = []
  if (!json || typeof json !== 'object') return rows
  const results = (json as { results?: unknown }).results
  if (!Array.isArray(results)) return rows
  for (const r of results) {
    if (!r || typeof r !== 'object') continue
    const c = r as {
      campaign?: { id?: unknown; name?: unknown; status?: unknown }
      metrics?: {
        impressions?: unknown
        clicks?: unknown
        costMicros?: unknown
        conversions?: unknown
      }
    }
    const id = c.campaign?.id
    if (id === null || id === undefined) continue
    rows.push({
      campanhaId: String(id),
      campanhaNome: typeof c.campaign?.name === 'string' ? c.campaign.name : '',
      status: typeof c.campaign?.status === 'string' ? c.campaign.status : 'UNKNOWN',
      impressoes: num(c.metrics?.impressions),
      cliques: num(c.metrics?.clicks),
      gasto: num(c.metrics?.costMicros),
      resultados: num(c.metrics?.conversions),
    })
  }
  return rows
}

/** Dispara a ingestão de uma fonte no endpoint interno do servidor (hook Skip). */
export async function dispararIngestao(
  fonte: 'meta_ads' | 'google_ads',
  baseUrl: string,
): Promise<IngestResult> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(`${baseUrl}/backend/v1/ingest?fonte=${fonte}`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { 'Content-Type': 'application/json' },
    })
    clearTimeout(timer)
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean
      ingested?: number
      erro?: string
    } | null
    if (!res.ok || !body?.ok) {
      return { ok: false, ingested: 0, erro: body?.erro ?? `HTTP ${res.status}`, fonte }
    }
    return { ok: true, ingested: body.ingested ?? 0, erro: null, fonte }
  } catch (e) {
    clearTimeout(timer)
    return {
      ok: false,
      ingested: 0,
      erro: e instanceof Error ? e.message : 'falha de rede',
      fonte,
    }
  }
}
