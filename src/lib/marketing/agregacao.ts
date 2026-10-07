/**
 * Motor de agregação do painel (SPEC-1-001, task 219345ea).
 * Implementa RN-01 (custo por resultado por objetivo), RN-02 (sem base de
 * comparação), RN-06 (ausência ≠ zero) e isolamento por origem (RN-05).
 */
import type {
  CoberturaCanal,
  ComparativoPeriodo,
  FiltrosPainel,
  LinhaPorObjetivo,
  RegistroMetricas,
  VereditoComparacao,
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
    const impressoes = somar(linhas.map((r) => r.metricas.impressoes))
    const cliques = somar(linhas.map((r) => r.metricas.cliques))
    // CA-2-01: resultados só somam quando TODOS os registros do grupo compartilham
    // objetivo + tipo de resultado + natureza — nunca entre tipos/objetivos distintos.
    const tiposUnicos = [...new Set(linhas.map((r) => r.resultType ?? null))]
    const resultadosCompatíveis =
      tiposUnicos.length === 1 && tiposUnicos[0] !== null
        ? somar(linhas.map((r) => r.metricas.resultados))
        : null
    const resultados = resultadosCompatíveis
    // Motivo do CPR indisponível (exibido na tela, nunca calculado em desconhecido):
    let motivoCprIndisponivel: string | null = null
    if (objetivo === 'nao_informado') {
      motivoCprIndisponivel =
        tiposUnicos.length === 1 && tiposUnicos[0] !== null
          ? `objetivo não informado pela fonte — resultados (${tiposUnicos[0]}) sem objetivo para comparar`
          : 'objetivo não informado pela fonte — resultados não comparáveis'
    } else if (tiposUnicos.length > 1) {
      motivoCprIndisponivel = 'tipos de resultado distintos no mesmo objetivo'
    }
    // CTR/CPC/CPM: usa o valor da fonte quando existe; sem valor na fonte,
    // deriva dos totais reais do grupo (null ≠ zero — RN-06).
    const ctrFonte = mediaPonderada(
      linhas.map((r) => ({ valor: r.metricas.ctr, peso: r.metricas.impressoes })),
    )
    const cpcFonte = mediaPonderada(
      linhas.map((r) => ({ valor: r.metricas.cpc, peso: r.metricas.cliques })),
    )
    const cpmFonte = mediaPonderada(
      linhas.map((r) => ({ valor: r.metricas.cpm, peso: r.metricas.impressoes })),
    )
    const ctr =
      ctrFonte !== null
        ? ctrFonte
        : cliques !== null && impressoes
          ? (cliques / impressoes) * 100
          : null
    const cpc = cpcFonte !== null ? cpcFonte : gasto !== null && cliques ? gasto / cliques : null
    const cpm =
      cpmFonte !== null
        ? cpmFonte
        : gasto !== null && impressoes
          ? (gasto / impressoes) * 1000
          : null
    // CA-2-01: CPR em grupo desconhecido é SEMPRE null (com motivo); nos demais,
    // só quando resultados compatíveis existem.
    const cpr =
      objetivo === 'nao_informado' || tiposUnicos.length > 1
        ? null
        : custoPorResultado(gasto, resultados)
    return {
      objetivo,
      registros: linhas.length,
      motivoCprIndisponivel,
      metricas: {
        alcance: somar(linhas.map((r) => r.metricas.alcance)),
        impressoes,
        cliques,
        gasto,
        resultados,
        cpc,
        cpm,
        ctr,
        // RN-01: calculado SOMENTE dentro do objetivo — nunca consolidado entre objetivos.
        custoPorResultado: cpr,
      },
    }
  })

  // CA-2-01: o total geral NUNCA soma resultados entre objetivos/tipos distintos —
  // só quando o dataset inteiro compartilha objetivo+tipo+natureza compatíveis.
  const tiposGlobais = [...new Set(registros.map((r) => r.resultType ?? null))]
  const objetivosGlobais = [...new Set(registros.map((r) => r.objetivo))]
  const resultadosTotais =
    tiposGlobais.length === 1 && tiposGlobais[0] !== null && objetivosGlobais.length === 1
      ? somar(registros.map((r) => r.metricas.resultados))
      : null

  return {
    total: {
      alcance: somar(registros.map((r) => r.metricas.alcance)),
      impressoes: somar(registros.map((r) => r.metricas.impressoes)),
      cliques: somar(registros.map((r) => r.metricas.cliques)),
      // Gasto é dinheiro: soma direta entre objetivos é comparável (RN-01 só
      // proíbe consolidar CUSTO POR RESULTADO, não o gasto em si).
      gasto: somar(registros.map((r) => r.metricas.gasto)),
      resultados: resultadosTotais,
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

/** Cobertura por canal num conjunto de registros (CA-2-04). */
function coberturaPorCanal(registros: RegistroMetricas[]): CoberturaCanal[] {
  const porCanal = new Map<string, { dias: Set<string>; inicio: string; fim: string }>()
  for (const r of registros) {
    const atual = porCanal.get(r.canal)
    if (!atual) {
      porCanal.set(r.canal, {
        dias: new Set([r.periodoInicio]),
        inicio: r.periodoInicio,
        fim: r.periodoFim,
      })
      continue
    }
    atual.dias.add(r.periodoInicio)
    if (r.periodoInicio < atual.inicio) atual.inicio = r.periodoInicio
    if (r.periodoFim > atual.fim) atual.fim = r.periodoFim
  }
  return [...porCanal.entries()]
    .map(([canal, c]) => ({
      canal: canal as CoberturaCanal['canal'],
      dias: c.dias.size,
      inicio: c.inicio,
      fim: c.fim,
    }))
    .sort((a, b) => a.canal.localeCompare(b.canal))
}

/**
 * Veredito de comparabilidade (CA-2-03): a variação% só é válida quando o
 * período atual e o anterior têm janelas equivalentes (mesmo nº de dias) e
 * ambos FECHADOS. Mês em curso ou cobertura desigual → suprimir % com motivo.
 */
function vereditoComparacao(
  registros: RegistroMetricas[],
  filtros: FiltrosPainel,
): VereditoComparacao {
  const semCobertura: VereditoComparacao = {
    valida: false,
    motivo: null,
    atual: [],
    anterior: [],
  }
  if (!filtros.periodoInicio || !filtros.periodoFim) return semCobertura

  const noPeriodo = filtrar(registros, filtros)
  const atual = coberturaPorCanal(noPeriodo)
  const ant = periodoAnterior(filtros.periodoInicio, filtros.periodoFim)
  const noAnterior = registros.filter(
    (r) => r.periodoInicio <= ant.fim && r.periodoFim >= ant.inicio,
  )
  const anterior = coberturaPorCanal(noAnterior)

  // Janela do período atual em dias (calendário, não dias com registro)
  const dInicio = new Date(`${filtros.periodoInicio}T00:00:00Z`)
  const dFim = new Date(`${filtros.periodoFim}T00:00:00Z`)
  const diasJanela = Math.round((dFim.getTime() - dInicio.getTime()) / 86400000) + 1

  // Mês em curso? A janela termina hoje ou depois (não fechada)
  const hoje = new Date().toISOString().slice(0, 10)
  const mesEmCurso = filtros.periodoFim >= hoje

  // Cobertura total do atual: soma de dias cobertos por canal (diários)
  const diasCobertosAtual = atual.reduce((acc, c) => acc + c.dias, 0)
  const diasCobertosAnterior = anterior.reduce((acc, c) => acc + c.dias, 0)

  if (mesEmCurso) {
    return {
      valida: false,
      motivo: `período em curso (${filtros.periodoInicio} a ${filtros.periodoFim}) — totais parciais, sem variação`,
      atual,
      anterior,
    }
  }
  if (diasCobertosAtual === 0 || diasCobertosAnterior === 0) {
    return {
      valida: false,
      motivo: 'sem base de comparação no período anterior',
      atual,
      anterior,
    }
  }
  // Janelas equivalentes: mesma quantidade de dias cobertos por canal
  const canaisAtual = new Map(atual.map((c) => [c.canal, c.dias]))
  const canaisAnterior = new Map(anterior.map((c) => [c.canal, c.dias]))
  for (const [canal, diasA] of canaisAtual) {
    const diasB = canaisAnterior.get(canal)
    if (diasB === undefined || diasB !== diasA) {
      return {
        valida: false,
        motivo: `cobertura desigual — ${canal}: ${diasA} dia(s) no período atual vs ${diasB ?? 0} no anterior`,
        atual,
        anterior,
      }
    }
  }
  // Janela fechada e equivalente: % válida
  if (diasJanela !== diasCobertosAtual) {
    return {
      valida: false,
      motivo: `janela de ${diasJanela} dias com ${diasCobertosAtual} dia(s) coberto(s) — período incompleto`,
      atual,
      anterior,
    }
  }
  return { valida: true, motivo: null, atual, anterior }
}

/** Constrói a visão do painel para um dataset e filtros, com comparativo (RN-02). */
export function construirVisao(registros: RegistroMetricas[], filtros: FiltrosPainel): VisaoPainel {
  const filtrados = filtrar(registros, filtros)
  const { total, porObjetivo } = agregar(filtrados)

  // Origem do dataset (todos os registros do dataset compartilham a origem — RN-05).
  const origem = registros.length > 0 ? registros[0].origem : 'demonstracao'

  // Manifesto de cobertura + veredito (CA-2-03/04)
  const cobertura = vereditoComparacao(registros, filtros)

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
    // CA-2-03: variação% só quando o veredito de cobertura diz que é válida;
    // caso contrário, suprimida com semBaseDeComparacao (o motivo fica no manifesto).
    const podeComparar = cobertura.valida
    comparativo = {
      gasto: podeComparar
        ? variacao(
            metricaPeriodo(filtrados, filtros.periodoInicio, filtros.periodoFim, 'gasto'),
            metricaPeriodo(registros, ant.inicio, ant.fim, 'gasto'),
          )
        : {
            atual: metricaPeriodo(filtrados, filtros.periodoInicio, filtros.periodoFim, 'gasto'),
            anterior: null,
            variacaoPercentual: null,
            semBaseDeComparacao: true,
          },
      cliques: podeComparar
        ? variacao(
            metricaPeriodo(filtrados, filtros.periodoInicio, filtros.periodoFim, 'cliques'),
            metricaPeriodo(registros, ant.inicio, ant.fim, 'cliques'),
          )
        : {
            atual: metricaPeriodo(filtrados, filtros.periodoInicio, filtros.periodoFim, 'cliques'),
            anterior: null,
            variacaoPercentual: null,
            semBaseDeComparacao: true,
          },
      impressoes: podeComparar
        ? variacao(
            metricaPeriodo(filtrados, filtros.periodoInicio, filtros.periodoFim, 'impressoes'),
            metricaPeriodo(registros, ant.inicio, ant.fim, 'impressoes'),
          )
        : {
            atual: metricaPeriodo(
              filtrados,
              filtros.periodoInicio,
              filtros.periodoFim,
              'impressoes',
            ),
            anterior: null,
            variacaoPercentual: null,
            semBaseDeComparacao: true,
          },
      resultados: podeComparar
        ? variacao(
            metricaPeriodo(filtrados, filtros.periodoInicio, filtros.periodoFim, 'resultados'),
            metricaPeriodo(registros, ant.inicio, ant.fim, 'resultados'),
          )
        : {
            atual: metricaPeriodo(
              filtrados,
              filtros.periodoInicio,
              filtros.periodoFim,
              'resultados',
            ),
            anterior: null,
            variacaoPercentual: null,
            semBaseDeComparacao: true,
          },
    }
  }

  return { origem, filtrosAplicados: filtros, cobertura, total, porObjetivo, comparativo }
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
    // Independente da ordem do dataset (o fetch real vem DESC), a janela do
    // mês é min(inicio) → max(fim) — comparar TODOS os campos, não só um.
    if (
      !atual ||
      r.periodoInicio < atual.inicio ||
      r.periodoFim > atual.fim ||
      r.periodoFim < atual.fim
    ) {
      meses.set(chave, {
        inicio:
          r.periodoInicio < atual?.inicio ? r.periodoInicio : (atual?.inicio ?? r.periodoInicio),
        fim: r.periodoFim > (atual?.fim ?? '') ? r.periodoFim : atual.fim,
      })
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
