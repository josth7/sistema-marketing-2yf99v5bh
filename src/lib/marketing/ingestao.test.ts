/**
 * Provas TDD da ingestão (task ea514702) — parsers, classificação de erro e RN-06.
 * Roda localmente com tsx (mesma estratégia da task 219345ea).
 */
import { classificarErroMeta, parseMetaAdsResponse } from './meta'
import { parseGoogleCampaigns } from './google'
import { paraRegistroMetricas } from './ingestao'
import type { MetricaDiariaRecord } from './ingestao'

let falhas = 0
function prova(nome: string, cond: boolean) {
  if (cond) {
    console.log(`  OK ${nome}`)
  } else {
    falhas += 1
    console.error(`  FALHOU ${nome}`)
  }
}

// ---------- parseMetaAdsResponse ----------
console.log('Meta — parse da resposta aninhada:')
{
  const resposta = {
    data: [
      {
        id: '120251537091590661',
        name: '06 - Seleções de Setembro/26 | Movienari',
        insights: {
          data: [
            { date_start: '2026-09-01', impressions: '67994', clicks: '1872', spend: '780.05' },
          ],
        },
      },
      {
        id: '120249777373310661',
        name: '04 - Seleções de Julho/26',
        // sem insights no período → registro com null (RN-06: não some)
      },
    ],
  }
  const rows = parseMetaAdsResponse(resposta)
  prova('2 linhas extraídas', rows.length === 2)
  prova('linha 1: impressões 67994 (string → number)', rows[0]?.impressoes === 67994)
  prova('linha 1: gasto 780.05', rows[0]?.gasto === 780.05)
  prova('linha 1: data da janela', rows[0]?.data === '2026-09-01')
  prova(
    'linha 2 sem insights: métricas null, não ausente',
    rows[1]?.impressoes === null && rows[1]?.campanhaId === '120249777373310661',
  )
  prova('resposta vazia/inválida → []', parseMetaAdsResponse({}).length === 0)
  prova('null → []', parseMetaAdsResponse(null).length === 0)
}

// ---------- classificarErroMeta ----------
console.log('Meta — classificação de erro (RN-07):')
{
  const auth = classificarErroMeta(
    400,
    JSON.stringify({ error: { code: 190, message: 'Invalid OAuth access token' } }),
  )
  prova('erro 190 → erro_autenticacao', auth.estado === 'erro_autenticacao' && auth.codigo === 190)
  const auth401 = classificarErroMeta(401, null)
  prova('HTTP 401 → erro_autenticacao', auth401.estado === 'erro_autenticacao')
  const server = classificarErroMeta(500, null)
  prova('HTTP 500 → erro_api', server.estado === 'erro_api')
  const estranho = classificarErroMeta(418, 'não é json')
  prova('status inesperado → erro_desconhecido', estranho.estado === 'erro_desconhecido')
}

// ---------- parseGoogleCampaigns ----------
console.log('Google — parse do relatório de campanhas:')
{
  const resposta = {
    results: [
      {
        campaign: {
          id: 23932332914,
          name: 'Movienari - Search - Geolocalização',
          status: 'ENABLED',
        },
        metrics: { impressions: 22238, clicks: 1617, costMicros: 3061688104, conversions: 163 },
      },
      {
        campaign: {
          id: 24271004293,
          name: 'MOVIENARI | 00 - Inscrições YouTube',
          status: 'ENABLED',
        },
        metrics: {},
      },
    ],
  }
  const rows = parseGoogleCampaigns(resposta)
  prova('2 campanhas extraídas', rows.length === 2)
  prova('campanha 1: cliques 1617', rows[0]?.cliques === 1617)
  prova(
    'campanha 1: gasto em micros → null-safe (convertido no hook)',
    rows[0]?.gasto === 3061688104,
  )
  prova('campanha 2 sem métricas: null, não 0', rows[1]?.impressoes === null)
  prova('resposta vazia → []', parseGoogleCampaigns({}).length === 0)
}

// ---------- paraRegistroMetricas (PocketBase → modelo do painel) ----------
console.log('Ingestão — PocketBase → modelo do painel (RN-06):')
{
  const rec: MetricaDiariaRecord = {
    id: 'abc123',
    origem: 'api',
    canal: 'meta_ads',
    natureza: 'pago',
    conta_id: '274282329866320',
    conta_nome: 'Haisan (WDK)',
    campanha_id: '120251537091590661',
    campanha_nome: '06 - Seleções de Setembro/26',
    objetivo: 'leads',
    data: '2026-09-01',
    alcance: null,
    impressoes: 67994,
    cliques: 1872,
    gasto: 780.05,
    resultados: null,
    cpc: null,
    cpm: null,
    ctr: null,
    updated: '2026-10-02T16:40:00Z',
  }
  const r = paraRegistroMetricas(rec)
  prova('origem preservada (api)', r.origem === 'api')
  prova('objetivo válido mapeado (leads)', r.objetivo === 'leads')
  prova('impressões numéricas', r.metricas.impressoes === 67994)
  prova('alcance ausente → null (nunca 0)', r.metricas.alcance === null)
  prova(
    'custoPorResultado não vem da fonte (calculado na agregação)',
    r.metricas.custoPorResultado === null,
  )
  const recObjetivoEstranho = paraRegistroMetricas({ ...rec, objetivo: 'comprar_casa' })
  prova('objetivo inválido → nao_informado', recObjetivoEstranho.objetivo === 'nao_informado')
}

if (falhas > 0) {
  console.error(`\nFALHOU: ${falhas} prova(s) não passaram`)
  process.exit(1)
} else {
  console.log('\nTODAS AS PROVAS PASSARAM')
}
