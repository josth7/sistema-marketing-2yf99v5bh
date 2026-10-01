/**
 * Adaptador Meta Ads (task ea514702, SPEC-1-001).
 *
 * Contrato validado em baseline (02/10): insights AGREGADOS falham (#100 — o
 * endpoint /insights não aceita os fields injetados), mas os ANINHADOS funcionam:
 *   GET /act_{id}/ads?fields=id,name,insights{impressions,clicks,spend}
 *
 * Regras da SPEC:
 * - timeout + retry 3× com backoff; erro não zera dados (RN-06/RN-07).
 * - erro de autenticação → estado 'erro_autenticacao' com aviso (RN-07).
 * - métrica ausente → null (nunca 0).
 */

export interface MetaInsightRow {
  campanhaId: string
  campanhaNome: string
  data: string // yyyy-mm-dd (dia único após fatiamento)
  impressoes: number | null
  cliques: number | null
  gasto: number | null
}

export interface MetaFetchResult {
  ok: boolean
  rows: MetaInsightRow[]
  erro: string | null
  codigoErro: number | null
}

const TIMEOUT_MS = 15000
const MAX_RETRIES = 3

function num(v: unknown): number | null {
  if (v === null || v === undefined) return null
  const n = Number(v)
  return Number.isFinite(n) ? n : null
}

/** Parse da resposta aninhada → linhas por (campanha, dia). Sem dia → usa date_start. */
export function parseMetaAdsResponse(json: unknown): MetaInsightRow[] {
  const rows: MetaInsightRow[] = []
  if (!json || typeof json !== 'object') return rows
  const data = (json as { data?: unknown }).data
  if (!Array.isArray(data)) return rows

  for (const item of data) {
    if (!item || typeof item !== 'object') continue
    const ad = item as { id?: unknown; name?: unknown; insights?: unknown }
    const campanhaId = typeof ad.id === 'string' ? ad.id : ''
    const campanhaNome = typeof ad.name === 'string' ? ad.name : ''
    if (!campanhaId) continue

    const insights = ad.insights as { data?: unknown } | undefined
    const iData = insights && typeof insights === 'object' ? insights.data : undefined
    if (!Array.isArray(iData) || iData.length === 0) {
      // Anúncio sem insights no período → registro com métricas null (RN-06: não some).
      rows.push({
        campanhaId,
        campanhaNome,
        data: '',
        impressoes: null,
        cliques: null,
        gasto: null,
      })
      continue
    }
    for (const ins of iData) {
      if (!ins || typeof ins !== 'object') continue
      const i = ins as {
        date_start?: unknown
        impressions?: unknown
        clicks?: unknown
        spend?: unknown
      }
      const dataStr = typeof i.date_start === 'string' ? i.date_start : ''
      rows.push({
        campanhaId,
        campanhaNome,
        data: dataStr,
        impressoes: num(i.impressions),
        cliques: num(i.clicks),
        gasto: num(i.spend),
      })
    }
  }
  return rows
}

/** Classifica um erro HTTP/fetch para o estado da fonte (RN-07). */
export function classificarErroMeta(
  status: number | null,
  body: string | null,
): {
  estado: 'erro_autenticacao' | 'erro_api' | 'erro_desconhecido'
  codigo: number | null
  mensagem: string
} {
  if (body) {
    try {
      const parsed = JSON.parse(body) as { error?: { code?: number; message?: string } }
      const code = parsed?.error?.code ?? null
      const msg = parsed?.error?.message ?? 'erro desconhecido'
      if (code === 190 || status === 401) {
        return { estado: 'erro_autenticacao', codigo: code, mensagem: msg }
      }
      return { estado: 'erro_api', codigo: code, mensagem: msg }
    } catch {
      // body não-JSON: cai no fallback por status
    }
  }
  if (status === 401)
    return { estado: 'erro_autenticacao', codigo: null, mensagem: 'não autorizado' }
  if (status !== null && status >= 500)
    return { estado: 'erro_api', codigo: null, mensagem: `erro de servidor (${status})` }
  return {
    estado: 'erro_desconhecido',
    codigo: null,
    mensagem: body?.slice(0, 200) ?? 'erro desconhecido',
  }
}

/** Fetch com timeout e retry 3× backoff (SPEC: timeout/retry obrigatórios). */
export async function fetchComRetry(
  url: string,
  init: RequestInit,
): Promise<{ status: number; body: string }> {
  let ultimoErro: unknown = null
  for (let tentativa = 0; tentativa <= MAX_RETRIES; tentativa++) {
    const ctrl = new AbortController()
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
    try {
      const res = await fetch(url, { ...init, signal: ctrl.signal })
      const body = await res.text()
      clearTimeout(timer)
      // 5xx e 429 → retry; 4xx de auth/validação → não adianta repetir
      if (res.status >= 500 || res.status === 429) {
        if (tentativa < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 2 ** tentativa * 1000))
          continue
        }
      }
      return { status: res.status, body }
    } catch (e) {
      clearTimeout(timer)
      ultimoErro = e
      if (tentativa < MAX_RETRIES) {
        await new Promise((r) => setTimeout(r, 2 ** tentativa * 1000))
        continue
      }
    }
  }
  throw ultimoErro instanceof Error ? ultimoErro : new Error('fetch falhou após retries')
}

/**
 * Busca os anúncios com insights aninhados da conta.
 * O token vem do ambiente do servidor (hook/secret) — nunca hardcoded.
 */
export async function buscarMetaAds(contaId: string, token: string): Promise<MetaFetchResult> {
  const url = `https://graph.facebook.com/v21.0/act_${contaId}/ads?fields=id,name,insights{impressions,clicks,spend}&limit=100`
  try {
    const { status, body } = await fetchComRetry(url, {
      headers: { Authorization: `Bearer ${token}` },
    })
    if (status !== 200) {
      const cls = classificarErroMeta(status, body)
      return { ok: false, rows: [], erro: cls.mensagem, codigoErro: cls.codigo }
    }
    const json: unknown = JSON.parse(body)
    return { ok: true, rows: parseMetaAdsResponse(json), erro: null, codigoErro: null }
  } catch (e) {
    return {
      ok: false,
      rows: [],
      erro: e instanceof Error ? e.message : 'falha de rede após retries',
      codigoErro: null,
    }
  }
}
