/**
 * Adaptadores de leitura por fonte (SPEC-1-001 revisada 01/10).
 *
 * Construção/revisão (CA-1-08): o painel funciona SEM conector e SEM CSV.
 * - Google Ads: adaptador preparado para leitura real via conector; em construção
 *   retorna estado "nao_conectado" (a conexão é ligada na task de ingestão ea514702).
 * - Meta Ads: estado "erro_autenticacao" documentado (incidente 190, 6 leituras,
 *   30/09–01/10) — aviso visível, sem bloquear o resto (RN-07).
 * - Demonstração: dataset fictício ISOLADO (origem 'demonstracao'), nunca misturado
 *   com reais (RN-05) e nunca persistido como resultado real.
 *
 * Não inventar endpoints nem credenciais: adaptadores reais entram na task de ingestão.
 */
import type { Canal, EstadoCanal, RegistroMetricas } from './types'

/** Incidente Meta registrado (RN-07) — sem segredos, apenas o estado. */
export const INCIDENTE_META = {
  codigo: 190,
  mensagem: 'Invalid OAuth access token - Cannot parse access token',
  ocorrencias: 6,
  periodo: '2026-09-30 15:55 — 2026-10-01 10:09 (BRT)',
  reconexaoTentada: true,
} as const

/** Estados atuais das fontes (fonte de verdade para os avisos do painel). */
export function estadosIniciais(): Record<Canal, EstadoCanal> {
  return {
    google_ads: {
      canal: 'google_ads',
      natureza: 'pago',
      estado: 'nao_conectado',
      aviso:
        'Google Ads: conexão será ativada na ingestão (task ea514702). Leitura real já validada em 30/09 — conta 962-453-3125.',
      ultimaIngestao: null,
    },
    meta_ads: {
      canal: 'meta_ads',
      natureza: 'pago',
      estado: 'erro_autenticacao',
      aviso: `Meta Ads indisponível: erro de autenticação (código ${INCIDENTE_META.codigo}) registrado em ${INCIDENTE_META.ocorrencias} leituras (${INCIDENTE_META.periodo}), inclusive após reconexão. Integração em tratamento — não bloqueia o painel.`,
      ultimaIngestao: null,
    },
    meta_organico: {
      canal: 'meta_organico',
      natureza: 'organico',
      estado: 'nao_conectado',
      aviso:
        'Meta orgânico: sem conexão própria validada. A visão fica vazia até haver dados — não inferir a partir de anúncios.',
      ultimaIngestao: null,
    },
  }
}

/**
 * Dataset demonstrativo — ISOLADO (RN-05).
 * Contas/campanhas fictícias, valores plausíveis, origem 'demonstracao'.
 * Serve só para avaliar organização, filtros e comparativo (CA-1-08).
 */
export function datasetDemonstrativo(): RegistroMetricas[] {
  const atualizadoEm = '2026-10-01T11:00:00-03:00'
  const mk = (
    id: string,
    canal: Canal,
    natureza: 'pago' | 'organico',
    contaNome: string,
    campanhaNome: string,
    objetivo: RegistroMetricas['objetivo'],
    periodoInicio: string,
    periodoFim: string,
    m: RegistroMetricas['metricas'],
  ): RegistroMetricas => ({
    id,
    origem: 'demonstracao',
    canal,
    natureza,
    contaId: null,
    contaNome,
    campanhaId: `demo-${id}`,
    campanhaNome,
    objetivo,
    periodoInicio,
    periodoFim,
    metricas: m,
    atualizadoEm,
  })

  // Período atual (set/2026) e anterior (ago/2026) — para comparativo com base.
  return [
    // ---- Google Ads (pago) — setembro ----
    mk(
      'g1',
      'google_ads',
      'pago',
      'Conta demonstrativa Google',
      'Demo — Pesquisa Salão',
      'vendas',
      '2026-09-01',
      '2026-09-30',
      {
        alcance: 18400,
        impressoes: 41200,
        cliques: 2140,
        gasto: 3120.5,
        resultados: 96,
        cpc: 1.46,
        cpm: 75.74,
        ctr: 5.19,
        custoPorResultado: 32.5,
      },
    ),
    mk(
      'g2',
      'google_ads',
      'pago',
      'Conta demonstrativa Google',
      'Demo — Pesquisa Barbearia',
      'vendas',
      '2026-09-01',
      '2026-09-30',
      {
        alcance: 12100,
        impressoes: 27800,
        cliques: 1480,
        gasto: 1980.0,
        resultados: 61,
        cpc: 1.34,
        cpm: 71.22,
        ctr: 5.32,
        custoPorResultado: 32.46,
      },
    ),
    mk(
      'g3',
      'google_ads',
      'pago',
      'Conta demonstrativa Google',
      'Demo — YouTube Lavatório',
      'video',
      '2026-09-01',
      '2026-09-30',
      {
        alcance: 45200,
        impressoes: 98600,
        cliques: 640,
        gasto: 890.0,
        resultados: null,
        cpc: 1.39,
        cpm: 9.03,
        ctr: 0.65,
        custoPorResultado: null,
      },
    ),
    // ---- Google Ads — agosto (base de comparação) ----
    mk(
      'g1a',
      'google_ads',
      'pago',
      'Conta demonstrativa Google',
      'Demo — Pesquisa Salão',
      'vendas',
      '2026-08-01',
      '2026-08-31',
      {
        alcance: 16900,
        impressoes: 38900,
        cliques: 1930,
        gasto: 3350.0,
        resultados: 88,
        cpc: 1.74,
        cpm: 86.12,
        ctr: 4.96,
        custoPorResultado: 38.07,
      },
    ),
    mk(
      'g2a',
      'google_ads',
      'pago',
      'Conta demonstrativa Google',
      'Demo — Pesquisa Barbearia',
      'vendas',
      '2026-08-01',
      '2026-08-31',
      {
        alcance: 11400,
        impressoes: 26100,
        cliques: 1310,
        gasto: 2140.0,
        resultados: 54,
        cpc: 1.63,
        cpm: 81.99,
        ctr: 5.02,
        custoPorResultado: 39.63,
      },
    ),
    mk(
      'g3a',
      'google_ads',
      'pago',
      'Conta demonstrativa Google',
      'Demo — YouTube Lavatório',
      'video',
      '2026-08-01',
      '2026-08-31',
      {
        alcance: 39800,
        impressoes: 87400,
        cliques: 520,
        gasto: 940.0,
        resultados: null,
        cpc: 1.81,
        cpm: 10.76,
        ctr: 0.59,
        custoPorResultado: null,
      },
    ),
    // ---- Meta Ads (pago) — setembro ----
    mk(
      'm1',
      'meta_ads',
      'pago',
      'Conta demonstrativa Meta',
      'Demo — Alcance Curitiba',
      'alcance',
      '2026-09-01',
      '2026-09-30',
      {
        alcance: 62300,
        impressoes: 148900,
        cliques: 2210,
        gasto: 1450.0,
        resultados: 62300,
        cpc: 0.66,
        cpm: 9.74,
        ctr: 1.48,
        custoPorResultado: 0.02,
      },
    ),
    mk(
      'm2',
      'meta_ads',
      'pago',
      'Conta demonstrativa Meta',
      'Demo — Leads Estética',
      'leads',
      '2026-09-01',
      '2026-09-30',
      {
        alcance: 28700,
        impressoes: 64100,
        cliques: 1890,
        gasto: 2180.0,
        resultados: 143,
        cpc: 1.15,
        cpm: 34.01,
        ctr: 2.95,
        custoPorResultado: 15.25,
      },
    ),
    // ---- Meta Ads — agosto ----
    mk(
      'm1a',
      'meta_ads',
      'pago',
      'Conta demonstrativa Meta',
      'Demo — Alcance Curitiba',
      'alcance',
      '2026-08-01',
      '2026-08-31',
      {
        alcance: 58100,
        impressoes: 139500,
        cliques: 2040,
        gasto: 1520.0,
        resultados: 58100,
        cpc: 0.75,
        cpm: 10.9,
        ctr: 1.46,
        custoPorResultado: 0.03,
      },
    ),
    mk(
      'm2a',
      'meta_ads',
      'pago',
      'Conta demonstrativa Meta',
      'Demo — Leads Estética',
      'leads',
      '2026-08-01',
      '2026-08-31',
      {
        alcance: 25300,
        impressoes: 57200,
        cliques: 1620,
        gasto: 2310.0,
        resultados: 118,
        cpc: 1.43,
        cpm: 40.38,
        ctr: 2.83,
        custoPorResultado: 19.58,
      },
    ),
    // ---- Meta orgânico (organico) — setembro (RN-03: separado do pago) ----
    mk(
      'o1',
      'meta_organico',
      'organico',
      'Página demo @haisanmoveis',
      'Demo — Posts Instagram',
      'engajamento',
      '2026-09-01',
      '2026-09-30',
      {
        alcance: 38400,
        impressoes: 91200,
        cliques: null,
        gasto: null,
        resultados: 5210,
        cpc: null,
        cpm: null,
        ctr: null,
        custoPorResultado: null,
      },
    ),
    mk(
      'o2',
      'meta_organico',
      'organico',
      'Página demo @haisanmoveis',
      'Demo — Reels Barbearia',
      'video',
      '2026-09-01',
      '2026-09-30',
      {
        alcance: 21900,
        impressoes: 47800,
        cliques: null,
        gasto: null,
        resultados: 1870,
        cpc: null,
        cpm: null,
        ctr: null,
        custoPorResultado: null,
      },
    ),
    // ---- Meta orgânico — agosto ----
    mk(
      'o1a',
      'meta_organico',
      'organico',
      'Página demo @haisanmoveis',
      'Demo — Posts Instagram',
      'engajamento',
      '2026-08-01',
      '2026-08-31',
      {
        alcance: 35100,
        impressoes: 83400,
        cliques: null,
        gasto: null,
        resultados: 4830,
        cpc: null,
        cpm: null,
        ctr: null,
        custoPorResultado: null,
      },
    ),
    mk(
      'o2a',
      'meta_organico',
      'organico',
      'Página demo @haisanmoveis',
      'Demo — Reels Barbearia',
      'video',
      '2026-08-01',
      '2026-08-31',
      {
        alcance: 18600,
        impressoes: 41200,
        cliques: null,
        gasto: null,
        resultados: 1540,
        cpc: null,
        cpm: null,
        ctr: null,
        custoPorResultado: null,
      },
    ),
  ]
}

/**
 * Dataset "real" em construção: vazio por enquanto.
 * A ingestão real (task ea514702) popula este dataset via adaptadores de conector.
 * RN-06: canal sem dados reais = indisponível, nunca completado com amostras.
 */
export function datasetReal(): RegistroMetricas[] {
  return []
}
