/**
 * Relatório executivo — template e regras (SPEC-2-004, card 3b491438, CA-2-10).
 *
 * Resumo FACTUAL, sem IA: fontes/datas/cobertura, indicadores por
 * natureza/objetivo/tipo (RN-01/CA-2-01), comparação só quando válida
 * (CA-2-03 — senão motivo), decisões atrasadas por 2+ ciclos destacadas.
 * Este card NÃO envia nada (job/inbox são do card a70d5ab8).
 */

export interface LinhaObjetivo {
  objetivo: string
  registros: number
  motivoCprIndisponivel: string | null
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
}

export interface BlocoNatureza {
  registros: number
  total: {
    alcance: number | null
    impressoes: number | null
    cliques: number | null
    gasto: number | null
    resultados: number | null
  }
  porObjetivo: LinhaObjetivo[]
}

export interface SnapshotRelatorio {
  pago: BlocoNatureza | null
  organico: BlocoNatureza | null
}

export interface CoberturaCanalItem {
  canal: string
  dias: number
}

export interface EligibilidadeComparacao {
  valida: boolean
  motivo: string | null
  anterior: { inicio: string; fim: string } | null
}

export interface DecisaoRef {
  id: string
  title: string
  responsible_user: string | null
  review_date: string | null
  state: string
  atrasada: boolean
}

export interface RelatorioItem {
  id: string
  uuid: string
  period_start: string
  period_end: string
  quinzena: number
  scope: string | null
  template_version: string
  policy_version: string | null
  report_revision: number
  state: string
  origem: string
  generated_at: string | null
  warnings: string | null
  coverage_by_source: string | null
}

export interface RelatorioDetalhe extends RelatorioItem {
  supersedes_id: string | null
  revision_reason: string | null
  data_snapshot_json: string | null
  comparison_eligibility: string | null
  alert_refs: string | null
  decision_refs: string | null
}

/** Duração em dias de uma janela [inicio, fim] (inclusive). */
export function diasJanela(inicio: string, fim: string): number {
  const d1 = new Date(`${inicio}T00:00:00Z`).getTime()
  const d2 = new Date(`${fim}T00:00:00Z`).getTime()
  return Math.max(1, Math.round((d2 - d1) / 86400000) + 1)
}

/**
 * CA-2-10: decisão atrasada por 2+ ciclos quinzenais (≈ 30 dias) fica em
 * DESTAQUE no relatório. review_date anterior a hoje-30d = atrasada.
 */
export function destaqueAtrasada(reviewDate: string | null, hojeISO: string): boolean {
  if (!reviewDate) return false
  const limite = new Date(new Date(`${hojeISO}T12:00:00Z`).getTime() - 30 * 86400000)
    .toISOString()
    .slice(0, 10)
  return reviewDate < limite
}

/**
 * Bloco comparativo do template (CA-2-03): variação% só quando eligibility
 * diz que é válida; senão o motivo é exibido e a % NUNCA aparece.
 */
export function blocoComparativo(
  metrica: { atual: number | null; anterior: number | null },
  eligibility: EligibilidadeComparacao,
): { variacao: number | null; motivo: string | null } {
  if (!eligibility.valida || metrica.atual === null || metrica.anterior === null) {
    return { variacao: null, motivo: eligibility.motivo ?? 'comparação indisponível' }
  }
  if (metrica.anterior === 0) return { variacao: null, motivo: 'anterior sem base (zero)' }
  return {
    variacao: ((metrica.atual - metrica.anterior) / metrica.anterior) * 100,
    motivo: null,
  }
}

/**
 * Resumo factual curto (sem IA): fontes, datas, limitações. Só usa o que está
 * no snapshot — nunca inventa número nem conclusão.
 */
export function resumoFactual(
  periodStart: string,
  periodEnd: string,
  cobertura: CoberturaCanalItem[],
  warnings: string[],
): string {
  const partes: string[] = []
  partes.push(`Período de ${periodStart} a ${periodEnd}.`)
  if (cobertura.length === 0) {
    partes.push('Nenhuma fonte com dados no período — indicadores indisponíveis.')
  } else {
    const chips = cobertura.map((c) => `${c.canal}: ${c.dias} dia(s)`).join(' · ')
    partes.push(`Fontes com dados — ${chips}.`)
  }
  if (warnings.length > 0) partes.push(`Avisos: ${warnings.join(' ')}`)
  return partes.join(' ')
}

/** Parse seguro do snapshot (JSON malformado → null, nunca quebra a tela). */
export function parseSnapshot(json: unknown): SnapshotRelatorio | null {
  const v = parseJson<SnapshotRelatorio | null>(json, null)
  if (typeof v !== 'object' || v === null) return null
  return v
}

/**
 * Parse seguro genérico (cobertura/eligibility/warnings).
 * PROVA 13/10: o SDK PocketBase v0.26 JÁ devolve campos json como OBJETO —
 * JSON.parse("[object Object]") degradava tudo para o padrão/fixture.
 * Aceita objeto direto OU string (legado).
 */
export function parseJson<T>(json: unknown, padrao: T): T {
  if (json === null || json === undefined || json === '') return padrao
  if (typeof json === 'object') return json as T
  try {
    return JSON.parse(String(json)) as T
  } catch {
    return padrao
  }
}

/** Rótulo legível da quinzena. */
export function rotuloQuinzena(periodStart: string, periodEnd: string): string {
  const [ano, mes] = periodStart.split('-')
  const nomes = [
    'janeiro',
    'fevereiro',
    'março',
    'abril',
    'maio',
    'junho',
    'julho',
    'agosto',
    'setembro',
    'outubro',
    'novembro',
    'dezembro',
  ]
  const nomeMes = nomes[Number(mes) - 1] ?? mes
  const q = periodStart.endsWith('-01') ? '1ª' : '2ª'
  return `${q} quinzena de ${nomeMes}/${ano} (${periodStart} a ${periodEnd})`
}

/**
 * FIXTURE de demonstração (RN-05: isolada — origem 'demonstracao', nunca lida
 * como dado real). Inclui payload XSS para provar renderização como TEXTO.
 */
export function fixtureSnapshot(): SnapshotRelatorio {
  return {
    pago: {
      registros: 3,
      total: {
        alcance: 38500,
        impressoes: 51200,
        cliques: 1830,
        gasto: 612.4,
        resultados: 96,
      },
      porObjetivo: [
        {
          objetivo: 'trafico',
          registros: 1,
          motivoCprIndisponivel: null,
          metricas: {
            alcance: 12000,
            impressoes: 18400,
            cliques: 810,
            gasto: 214.9,
            resultados: null,
            cpc: 0.27,
            cpm: 11.68,
            ctr: 4.4,
            custoPorResultado: null,
          },
        },
        {
          objetivo: 'leads',
          registros: 1,
          motivoCprIndisponivel: null,
          metricas: {
            alcance: 9100,
            impressoes: 12300,
            cliques: 420,
            gasto: 186.0,
            resultados: 96,
            cpc: 0.44,
            cpm: 15.12,
            ctr: 3.41,
            custoPorResultado: 1.94,
          },
        },
        {
          objetivo: 'nao_informado',
          registros: 1,
          motivoCprIndisponivel:
            'objetivo não informado pela fonte — resultados (conversoes) sem objetivo para comparar',
          metricas: {
            alcance: 17400,
            impressoes: 20500,
            cliques: 600,
            gasto: 211.5,
            resultados: 88,
            cpc: 0.35,
            cpm: 10.32,
            ctr: 2.93,
            custoPorResultado: null,
          },
        },
      ],
    },
    organico: {
      registros: 1,
      total: {
        alcance: 1540,
        impressoes: null,
        cliques: null,
        gasto: null,
        resultados: null,
      },
      porObjetivo: [
        {
          objetivo: 'nao_informado',
          registros: 1,
          motivoCprIndisponivel: 'orgânico sem objetivo na fonte',
          metricas: {
            alcance: 1540,
            impressoes: null,
            cliques: null,
            gasto: null,
            resultados: null,
            cpc: null,
            cpm: null,
            ctr: null,
            custoPorResultado: null,
          },
        },
      ],
    },
  }
}

/** Fixture de decisões para a prévia (uma atrasada, uma em dia). */
export function fixtureDecisoes(): DecisaoRef[] {
  return [
    {
      id: 'fixture-1',
      title: '<img src=x onerror=alert(1)>',
      responsible_user: null,
      review_date: '2026-08-20',
      state: 'open',
      atrasada: true,
    },
    {
      id: 'fixture-2',
      title: 'Revisar verba da campanha de leads',
      responsible_user: null,
      review_date: '2026-10-20',
      state: 'open',
      atrasada: false,
    },
  ]
}
