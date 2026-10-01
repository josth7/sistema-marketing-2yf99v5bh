/**
 * Motor de agregação do painel (SPEC-1-001, task 219345ea).
 * Implementa RN-01 (custo por resultado por objetivo), RN-02 (sem base de
 * comparação), RN-06 (ausência ≠ zero) e isolamento por origem (RN-05).
 */
import type {
  ComparativoPeriodo,
  FiltrosPainel,
  LinhaPorObjetivo,
  RegistroMetricas,
  VisaoPainel,
} from './types'
import { custoPorResultado, mediaPonderada, somar, variacao } from './types'

/** Filtra registros por período, canais, objetivos e natureza. */
export function filtrar(registros: RegistroMetricas[], f: FiltrosPainel): RegistroMetricas[] {
  return registros.filter((r) => {
    if (f.periodoInicio && r.periodoFim < f.periodoInicio) return false
    if (f.periodoFim && r.periodoInicio > f.periodoFim) return false
    if (f.canais.length > 0 && !f.canais.includes(r.canal)) return false
    if (f.objetivos.length > 0 && !f.objetivos.includes(r.objetivo)) return false
    if (f.natureza !== 'ambos' && r.natureza !== f.natureza) return false
    return true
  })
}

/** Deslocamento de datas para o período anterior (comparativo). */
function periodoAnterior(inicio: string, fim: string): { inicio: string; fim: string } {
  const dInicio = new Date(`${inicio}T00:00:00Z`)
  const dFim = new Date(`${fim}T00:00:00Z`)
  const dias = Math.max(1, Math.round((dFim.getTime() - dInicio.getTime()) / 86400000) + 1)
  const anteriorFim = new Date(dInicio.getTime() - 86400000)
  const anteriorInicio = new Date(anteriorFim.getTime() - (dias - 1) * 86400000)
  const iso = (d: Date) => d.toISOString().slice(0, 10)
  return { inicio: iso(anteriorInicio), fim: iso(anteriorFim) }
}

/** Agrega uma lista de registros em totais + linhas por objetivo (RN-01). */
export function agregar(registros: RegistroMetricas[]): {
  total: VisaoPainel['total']
  porObjetivo: LinhaPorObjetivo[]
} {
  const objetivosUnicos = [...new Set(registros.map((r) => r.objetivo))].sort()

  const porObjetivo: LinhaPorObjetivo[] = objetivosUnicos.map((objetivo) => {
    const linhas = registros.filter((r) => r.objetivo === objetivo)
    const gasto = somar(linhas.map((r) => r.metricas.gasto))
    const resultados = somar(linhas.map((r) => r.metricas.resultados))
    const impressoes = somar(linhas.map((r) => r.metricas.impressoes))
    return {
      objetivo,
      registros: linhas.length,
      metricas: {
        alcance: somar(linhas.map((r) => r.metricas.alcance)),
        impressoes,
        cliques: somar(linhas.map((r) => r.metricas.cliques)),
        gasto,
        resultados,
        cpc: mediaPonderada(
          linhas.map((r) => ({ valor: r.metricas.cpc, peso: r.metricas.cliques })),
        ),
        cpm: mediaPonderada(
          linhas.map((r) => ({ valor: r.metricas.cpm, peso: r.metricas.impressoes })),
        ),
        ctr: mediaPonderada(
          linhas.map((r) => ({ valor: r.metricas.ctr, peso: r.metricas.impressoes })),
        ),
        // RN-01: calculado SOMENTE dentro do objetivo — nunca consolidado entre objetivos.
        custoPorResultado: custoPorResultado(gasto, resultados),
      },
    }
  })

  return {
    total: {
      alcance: somar(registros.map((r) => r.metricas.alcance)),
      impressoes: somar(registros.map((r) => r.metricas.impressoes)),
      cliques: somar(registros.map((r) => r.metricas.cliques)),
      // Gasto é dinheiro: soma direta entre objetivos é comparável (RN-01 só
      // proíbe consolidar CUSTO POR RESULTADO, não o gasto em si).
      gasto: somar(registros.map((r) => r.metricas.gasto)),
      resultados: somar(registros.map((r) => r.metricas.resultados)),
    },
    porObjetivo,
  }
}

/** Métrica de um período (comparativo). */
function metricaPeriodo(
  registros: RegistroMetricas[],
  inicio: string,
  fim: string,
  campo: 'gasto' | 'cliques' | 'impressoes' | 'resultados',
): number | null {
  // Sobreposição de intervalo (não contenção estrita): um registro mensal
  // (ex. 01/08–31/08) conta na janela 02/08–31/08 — granularidade do dado.
  const noPeriodo = registros.filter((r) => r.periodoInicio <= fim && r.periodoFim >= inicio)
  return somar(noPeriodo.map((r) => r.metricas[campo]))
}

/** Constrói a visão do painel para um dataset e filtros, com comparativo (RN-02). */
export function construirVisao(registros: RegistroMetricas[], filtros: FiltrosPainel): VisaoPainel {
  const filtrados = filtrar(registros, filtros)
  const { total, porObjetivo } = agregar(filtrados)

  // Origem do dataset (todos os registros do dataset compartilham a origem — RN-05).
  const origem = registros.length > 0 ? registros[0].origem : 'demonstracao'

  // Comparativo: só faz sentido com período explícito; sem base → RN-02.
  let comparativo: VisaoPainel['comparativo'] = {
    gasto: { atual: null, anterior: null, variacaoPercentual: null, semBaseDeComparacao: true },
    cliques: { atual: null, anterior: null, variacaoPercentual: null, semBaseDeComparacao: true },
    impressoes: {
      atual: null,
      anterior: null,
      variacaoPercentual: null,
      semBaseDeComparacao: true,
    },
    resultados: {
      atual: null,
      anterior: null,
      variacaoPercentual: null,
      semBaseDeComparacao: true,
    },
  }

  if (filtros.periodoInicio && filtros.periodoFim) {
    const ant = periodoAnterior(filtros.periodoInicio, filtros.periodoFim)
    comparativo = {
      gasto: variacao(
        metricaPeriodo(filtrados, filtros.periodoInicio, filtros.periodoFim, 'gasto'),
        metricaPeriodo(registros, ant.inicio, ant.fim, 'gasto'),
      ),
      cliques: variacao(
        metricaPeriodo(filtrados, filtros.periodoInicio, filtros.periodoFim, 'cliques'),
        metricaPeriodo(registros, ant.inicio, ant.fim, 'cliques'),
      ),
      impressoes: variacao(
        metricaPeriodo(filtrados, filtros.periodoInicio, filtros.periodoFim, 'impressoes'),
        metricaPeriodo(registros, ant.inicio, ant.fim, 'impressoes'),
      ),
      resultados: variacao(
        metricaPeriodo(filtrados, filtros.periodoInicio, filtros.periodoFim, 'resultados'),
        metricaPeriodo(registros, ant.inicio, ant.fim, 'resultados'),
      ),
    }
  }

  return { origem, filtrosAplicados: filtros, total, porObjetivo, comparativo }
}

/** Períodos disponíveis no dataset (para o seletor de período). */
export function periodosDisponiveis(registros: RegistroMetricas[]): Array<{
  label: string
  inicio: string
  fim: string
}> {
  const meses = new Map<string, { inicio: string; fim: string }>()
  for (const r of registros) {
    const chave = r.periodoInicio.slice(0, 7)
    const atual = meses.get(chave)
    if (!atual || r.periodoInicio < atual.inicio || r.periodoFim > atual.fim) {
      meses.set(chave, { inicio: r.periodoInicio, fim: r.periodoFim })
    }
  }
  return [...meses.entries()]
    .sort(([a], [b]) => (a < b ? 1 : -1))
    .map(([chave, p]) => {
      const [ano, mes] = chave.split('-')
      const nomes = [
        'jan',
        'fev',
        'mar',
        'abr',
        'mai',
        'jun',
        'jul',
        'ago',
        'set',
        'out',
        'nov',
        'dez',
      ]
      return {
        label: `${nomes[Number(mes) - 1]}/${ano}`,
        inicio: p.inicio,
        fim: p.fim,
      }
    })
}
