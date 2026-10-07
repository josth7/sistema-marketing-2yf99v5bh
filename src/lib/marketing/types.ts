/**
 * Modelo de dados do painel consolidado (SPEC-1-001, task 219345ea).
 *
 * Regras da SPEC que este modelo sustenta:
 * - RN-01: objetivos distintos nunca somam custo por resultado (objetivo é campo de agrupamento).
 * - RN-02: sem histórico comparável → "sem base de comparação" (nunca 0%).
 * - RN-03: orgânico e pago em visões separadas (campo `natureza`).
 * - RN-05: dados demonstrativos ficam isolados por `origem` e nunca misturam com reais.
 * - RN-06: canal sem dados reais aparece como indisponível — ausência NUNCA vira zero.
 * - RN-07: erro de autenticação persistente é estado registrado, não bloqueio da construção.
 */

/** Origem dos dados — determina o dataset e o aviso exibido (RN-05). */
export type OrigemDados = 'api' | 'csv' | 'demonstracao'

/** Canal de marketing. Orgânico e pago são separados (RN-03). */
export type Canal = 'meta_ads' | 'google_ads' | 'meta_organico'

/** Natureza da visão: pago (mídia) ou orgânico. */
export type Natureza = 'pago' | 'organico'

/**
 * Objetivo de campanha — agrupamento obrigatório para custo por resultado (RN-01).
 * Métricas de custo por resultado só são calculadas DENTRO de um mesmo objetivo.
 */
export type ObjetivoCampanha =
  | 'alcance'
  | 'trafico'
  | 'engajamento'
  | 'leads'
  | 'vendas'
  | 'video'
  | 'nao_informado'

/**
 * Tipo do resultado (CA-2-01): resultados de tipos distintos NUNCA são somados.
 * Google = 'conversoes' (all_conversions); Meta = null (a fonte não fornece tipo
 * separado no endpoint lido — indisponível com motivo, nunca inventado).
 */
export type TipoResultado = 'conversoes' | null

/** Estado de disponibilidade de uma fonte/canal (RN-06, RN-07). */
export type EstadoFonte = 'conectado' | 'nao_conectado' | 'erro_autenticacao' | 'sem_dados'

/** Um registro de métricas agregadas de uma campanha em um período. */
export interface RegistroMetricas {
  id: string
  origem: OrigemDados
  canal: Canal
  natureza: Natureza
  contaId: string | null
  contaNome: string | null
  campanhaId: string
  campanhaNome: string
  objetivo: ObjetivoCampanha
  /** Código original da fonte (ex.: OUTCOME_AWARENESS) — nunca descartado. */
  objetivoRaw: string | null
  /** Tipo do resultado ('conversoes' no Google; null quando a fonte não fornece). */
  resultType: TipoResultado
  /** Início do período (ISO yyyy-mm-dd). */
  periodoInicio: string
  /** Fim do período (ISO yyyy-mm-dd). */
  periodoFim: string
  /** null = indisponível — NUNCA tratar como 0 (RN-06). */
  metricas: {
    alcance: number | null
    impressoes: number | null
    cliques: number | null
    gasto: number | null
    resultados: number | null
    cpc: number | null
    cpm: number | null
    ctr: number | null
    custoPorResultado: number | null
  }
  /** Data/hora da atualização/ingestão (ISO). */
  atualizadoEm: string
}

/** Estado de uma fonte de dados exibido no painel. */
export interface EstadoCanal {
  canal: Canal
  natureza: Natureza
  estado: EstadoFonte
  /** Mensagem de aviso quando não conectado/erro (RN-06/RN-07). */
  aviso: string | null
  /** Última ingestão válida, quando existir (preservar, nunca apagar). */
  ultimaIngestao: string | null
}

/** Filtros do painel. */
export interface FiltrosPainel {
  /** Período em dias ISO; null = tudo que existe no dataset. */
  periodoInicio: string | null
  periodoFim: string | null
  canais: Canal[]
  objetivos: ObjetivoCampanha[]
  natureza: Natureza | 'ambos'
}

/** Comparativo entre períodos (RN-02: sem base → null, nunca 0%). */
export interface ComparativoPeriodo {
  atual: number | null
  anterior: number | null
  /** Variação percentual; null quando não há base de comparação. */
  variacaoPercentual: number | null
  /** true quando o período anterior não tem dados (RN-02). */
  semBaseDeComparacao: boolean
}

/** Linha agregada por objetivo — base da segmentação (RN-01). */
export interface LinhaPorObjetivo {
  objetivo: ObjetivoCampanha
  registros: number
  /** Motivo de indisponibilidade do CPR quando objetivo desconhecido (CA-2-01). */
  motivoCprIndisponivel: string | null
  metricas: {
    alcance: number | null
    impressoes: number | null
    cliques: number | null
    gasto: number | null
    /** Resultados SOMENTE quando todos os registros compartilham objetivo+tipo+natureza. */
    resultados: number | null
    cpc: number | null
    cpm: number | null
    ctr: number | null
    /** Custo por resultado SOMENTE entre campanhas do MESMO objetivo (RN-01). */
    custoPorResultado: number | null
  }
}

/** Resultado agregado de uma visão do painel. */
export interface VisaoPainel {
  origem: OrigemDados
  filtrosAplicados: FiltrosPainel
  total: {
    alcance: number | null
    impressoes: number | null
    cliques: number | null
    /** Gasto total: soma direta é permitida (dinheiro é comparável entre objetivos). */
    gasto: number | null
    resultados: number | null
  }
  porObjetivo: LinhaPorObjetivo[]
  comparativo: {
    gasto: ComparativoPeriodo
    cliques: ComparativoPeriodo
    impressoes: ComparativoPeriodo
    resultados: ComparativoPeriodo
  }
}

/** Soma ignorando null (ausência não é zero, mas a soma dos presentes é válida). */
export function somar(valores: Array<number | null>): number | null {
  const presentes = valores.filter((v): v is number => v !== null)
  if (presentes.length === 0) return null
  return presentes.reduce((acc, v) => acc + v, 0)
}

/** Média ponderada por impressões para CTR/CPM agregados; null se sem base. */
export function mediaPonderada(
  pares: Array<{ valor: number | null; peso: number | null }>,
): number | null {
  let somaPeso = 0
  let somaValor = 0
  for (const { valor, peso } of pares) {
    if (valor === null || peso === null) continue
    somaValor += valor * peso
    somaPeso += peso
  }
  if (somaPeso === 0) return null
  return somaValor / somaPeso
}

/** Custo por resultado agregado DENTRO de um objetivo (RN-01). */
export function custoPorResultado(gasto: number | null, resultados: number | null): number | null {
  if (gasto === null || resultados === null || resultados === 0) return null
  return gasto / resultados
}

/** Variação percentual com RN-02: sem base anterior → null + flag. */
export function variacao(atual: number | null, anterior: number | null): ComparativoPeriodo {
  if (atual === null || anterior === null || anterior === 0) {
    return { atual, anterior, variacaoPercentual: null, semBaseDeComparacao: true }
  }
  return {
    atual,
    anterior,
    variacaoPercentual: ((atual - anterior) / anterior) * 100,
    semBaseDeComparacao: false,
  }
}

/** Formata variação para exibição respeitando RN-02. */
export function formatarVariacao(c: ComparativoPeriodo): string {
  if (c.semBaseDeComparacao) return 'Sem base de comparação'
  const sinal = c.variacaoPercentual >= 0 ? '+' : ''
  return `${sinal}${c.variacaoPercentual.toFixed(1)}%`
}

/** Formata número inteiro; null → "—" (indisponível, RN-06). */
export function formatarInteiro(v: number | null): string {
  if (v === null) return '—'
  return v.toLocaleString('pt-BR', { maximumFractionDigits: 0 })
}

/** Formata moeda BRL; null → "—". */
export function formatarMoeda(v: number | null): string {
  if (v === null) return '—'
  return v.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

/** Formata percentual; null → "—". */
export function formatarPercentual(v: number | null): string {
  if (v === null) return '—'
  return `${v.toFixed(2)}%`
}
