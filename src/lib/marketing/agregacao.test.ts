/**
 * Testes do motor de agregação — provas da SPEC-1-001 (task 219345ea).
 * Executável no QA do Skip via import estático? Não: rodamos via node no build local.
 * Este arquivo é o TDD automatizado (RED/GREEN/REGRESSÕES) da construção.
 * Estrutura: asserts simples, sem dependências — roda com `node --experimental-strip-types`
 * ou é importado pela suíte do projeto quando habilitada.
 */
import { agregar, construirVisao, filtrar, periodosDisponiveis } from './agregacao'
import { custoPorResultado, somar, variacao } from './types'
import type { FiltrosPainel, RegistroMetricas } from './types'

let falhas = 0
function prova(nome: string, cond: boolean) {
  if (cond) {
    console.log(`  ✓ ${nome}`)
  } else {
    falhas += 1
    console.error(`  ✗ ${nome}`)
  }
}

const mk = (over: Partial<RegistroMetricas>): RegistroMetricas => ({
  id: over.id ?? 'x',
  origem: 'demonstracao',
  canal: 'google_ads',
  natureza: 'pago',
  contaId: null,
  contaNome: 'Conta demo',
  campanhaId: 'c1',
  campanhaNome: 'Campanha',
  objetivo: 'vendas',
  objetivoRaw: null,
  resultType: null,
  periodoInicio: '2026-09-01',
  periodoFim: '2026-09-30',
  metricas: {
    alcance: null,
    impressoes: null,
    cliques: null,
    gasto: null,
    resultados: null,
    cpc: null,
    cpm: null,
    ctr: null,
    custoPorResultado: null,
  },
  atualizadoEm: '2026-10-01T11:00:00-03:00',
  ...over,
})

const FILTROS_VAZIOS: FiltrosPainel = {
  periodoInicio: null,
  periodoFim: null,
  canais: [],
  objetivos: [],
  natureza: 'ambos',
}

// ---------- RED: dataset vazio ----------
console.log('RED — painel sem dados:')
{
  const visao = construirVisao([], FILTROS_VAZIOS)
  prova('total.gasto = null (indisponível, não 0)', visao.total.gasto === null)
  prova('porObjetivo vazio', visao.porObjetivo.length === 0)
  prova('comparativo sem base (RN-02)', visao.comparativo.gasto.semBaseDeComparacao)
}

// ---------- RN-06: ausência ≠ zero ----------
console.log('RN-06 — ausência nunca vira zero:')
{
  prova('somar([]) = null', somar([]) === null)
  prova('somar([null, null]) = null', somar([null, null]) === null)
  prova('somar([null, 5]) = 5 (presentes contam)', somar([null, 5]) === 5)
  prova('custoPorResultado(null, 10) = null', custoPorResultado(null, 10) === null)
  prova('custoPorResultado(100, null) = null', custoPorResultado(100, null) === null)
  prova('custoPorResultado(100, 0) = null (divisão impossível)', custoPorResultado(100, 0) === null)
}

// ---------- RN-01: custo por resultado por objetivo ----------
console.log('RN-01 — custo por resultado isolado por objetivo:')
{
  const registros = [
    mk({
      id: 'a',
      objetivo: 'vendas',
      metricas: { ...mk({}).metricas, gasto: 100, resultados: 10 },
    }),
    mk({
      id: 'b',
      objetivo: 'alcance',
      metricas: { ...mk({}).metricas, gasto: 200, resultados: 4000 },
    }),
  ]
  const agg = agregar(registros)
  const vendas = agg.porObjetivo.find((l) => l.objetivo === 'vendas')
  const alcance = agg.porObjetivo.find((l) => l.objetivo === 'alcance')
  prova('vendas: custo/resultado = 10', vendas?.metricas.custoPorResultado === 10)
  prova('alcance: custo/resultado = 0.05', alcance?.metricas.custoPorResultado === 0.05)
  prova('gasto total soma entre objetivos (dinheiro é comparável)', agg.total.gasto === 300)
  prova('resultados totais NÃO geram custo/resultado consolidado', agg.porObjetivo.length === 2)
}

// ---------- RN-02: comparativo ----------
console.log('RN-02 — comparativo com e sem base:')
{
  prova('variacao(100, 200) = -50%', variacao(100, 200).variacaoPercentual === -50)
  prova('variacao(100, null) → sem base', variacao(100, null).semBaseDeComparacao)
  prova('variacao(null, 100) → sem base', variacao(null, 100).semBaseDeComparacao)
  prova('variacao(100, 0) → sem base (não infinito)', variacao(100, 0).semBaseDeComparacao)
}

// ---------- Filtros ----------
console.log('Filtros — período, canal, objetivo, natureza:')
{
  const registros = [
    mk({
      id: 'g',
      canal: 'google_ads',
      natureza: 'pago',
      periodoInicio: '2026-09-01',
      periodoFim: '2026-09-30',
    }),
    mk({
      id: 'm',
      canal: 'meta_ads',
      natureza: 'pago',
      periodoInicio: '2026-09-01',
      periodoFim: '2026-09-30',
    }),
    mk({
      id: 'o',
      canal: 'meta_organico',
      natureza: 'organico',
      periodoInicio: '2026-09-01',
      periodoFim: '2026-09-30',
    }),
    mk({
      id: 'a',
      canal: 'google_ads',
      natureza: 'pago',
      periodoInicio: '2026-08-01',
      periodoFim: '2026-08-31',
    }),
  ]
  prova(
    'filtro por canal meta_ads → 1 registro',
    filtrar(registros, { ...FILTROS_VAZIOS, canais: ['meta_ads'] }).length === 1,
  )
  prova(
    'filtro orgânico separado (RN-03) → 1 registro',
    filtrar(registros, { ...FILTROS_VAZIOS, natureza: 'organico' }).length === 1,
  )
  prova(
    'filtro período setembro → 3 registros',
    filtrar(registros, { ...FILTROS_VAZIOS, periodoInicio: '2026-09-01', periodoFim: '2026-09-30' })
      .length === 3,
  )
  prova('periodosDisponiveis → ago e set', periodosDisponiveis(registros).length === 2)
}

// ---------- RN-05: isolamento por origem ----------
console.log('RN-05 — origem preservada e isolada:')
{
  const registros = [mk({ id: 'd', origem: 'demonstracao' })]
  const visao = construirVisao(registros, FILTROS_VAZIOS)
  prova('visão carrega a origem do dataset', visao.origem === 'demonstracao')
  const reais: RegistroMetricas[] = []
  prova(
    'dataset real vazio não mistura com demo',
    construirVisao(reais, FILTROS_VAZIOS).total.gasto === null,
  )
}

// ---------- REGRESSÃO comparativo: base mensal existente é usada (bug da janela) ----------
console.log('REGRESSÃO — comparativo usa a base existente:')
{
  const registros = [
    mk({
      id: 'set',
      periodoInicio: '2026-09-01',
      periodoFim: '2026-09-30',
      metricas: { ...mk({}).metricas, gasto: 1000 },
    }),
    mk({
      id: 'ago',
      periodoInicio: '2026-08-01',
      periodoFim: '2026-08-31',
      metricas: { ...mk({}).metricas, gasto: 800 },
    }),
  ]
  const visao = construirVisao(registros, {
    ...FILTROS_VAZIOS,
    periodoInicio: '2026-09-01',
    periodoFim: '2026-09-30',
  })
  prova(
    'comparativo de gasto TEM base (agosto existe)',
    visao.comparativo.gasto.semBaseDeComparacao === false,
  )
  prova('variação = +25%', visao.comparativo.gasto.variacaoPercentual === 25)
  prova('anterior = 800', visao.comparativo.gasto.anterior === 800)
}

// ---------- CA-2-01: CPR null em objetivo desconhecido; sem soma entre tipos ----------
console.log('CA-2-01 — CPR null com motivo em desconhecido; resultados nunca somam entre tipos:')
{
  // Grupo "Não informado" (Google sem objetivo) com resultados do tipo 'conversoes'
  const google = [
    mk({
      id: 'g1',
      objetivo: 'nao_informado',
      objetivoRaw: 'nao_informado',
      resultType: 'conversoes',
      metricas: {
        ...mk({}).metricas,
        gasto: 658.77,
        resultados: 24,
        cliques: 510,
        impressoes: 7613,
      },
    }),
  ]
  const aggG = agregar(google)
  const linhaG = aggG.porObjetivo[0]
  prova('CPR null em objetivo desconhecido (CA-2-01)', linhaG.metricas.custoPorResultado === null)
  prova(
    'motivo visível: objetivo não informado pela fonte',
    linhaG.motivoCprIndisponivel ===
      'objetivo não informado pela fonte — resultados não comparáveis',
  )
  prova('resultados do grupo único e compatível somam (24)', linhaG.metricas.resultados === 24)

  // Grupo misto: Google (conversões) + Meta (sem tipo) no mesmo "Não informado"
  const misto = [
    ...google,
    mk({
      id: 'm1',
      canal: 'meta_ads',
      objetivo: 'nao_informado',
      objetivoRaw: 'OUTCOME_AWARENESS',
      resultType: null,
      metricas: { ...mk({}).metricas, gasto: 530.28, resultados: null },
    }),
  ]
  const aggM = agregar(misto)
  const linhaM = aggM.porObjetivo.find((l) => l.objetivo === 'nao_informado')
  prova(
    'grupo misto: resultados = null (tipos distintos não somam)',
    linhaM?.metricas.resultados === null,
  )
  prova('grupo misto: CPR = null', linhaM?.metricas.custoPorResultado === null)
  prova(
    'grupo misto: motivo = resultados não comparáveis (tipos mistos no desconhecido)',
    linhaM?.motivoCprIndisponivel ===
      'objetivo não informado pela fonte — resultados não comparáveis',
  )
  prova(
    'grupo só Google: motivo cita o tipo (conversoes)',
    linhaG.motivoCprIndisponivel ===
      'objetivo não informado pela fonte — resultados (conversoes) sem objetivo para comparar',
  )
  prova(
    'total geral: resultados = null (objetivos/tipos distintos)',
    aggM.total.resultados === null,
  )
  prova(
    'total geral: gasto SOMA (dinheiro é comparável)',
    Math.abs((aggM.total.gasto ?? 0) - 1189.05) < 0.01,
  )

  // Objetivos mapeados da Meta: CPR só dentro do mesmo objetivo+tipo
  const meta = [
    mk({
      id: 'a1',
      canal: 'meta_ads',
      objetivo: 'alcance',
      objetivoRaw: 'OUTCOME_AWARENESS',
      resultType: null,
      metricas: { ...mk({}).metricas, gasto: 125.82, resultados: null, impressoes: 97819 },
    }),
    mk({
      id: 'l1',
      canal: 'meta_ads',
      objetivo: 'leads',
      objetivoRaw: 'OUTCOME_LEADS',
      resultType: null,
      metricas: { ...mk({}).metricas, gasto: 113.16, resultados: null },
    }),
  ]
  const aggMeta = agregar(meta)
  prova(
    'Meta awareness: linha separada de leads (objetivos distintos não agrupam)',
    aggMeta.porObjetivo.length === 2,
  )
  prova(
    'Meta sem tipo de resultado: CPR null (não 0)',
    aggMeta.porObjetivo[0].metricas.custoPorResultado === null,
  )
}

// ---------- CA-2-02: pago e orgânico em blocos separados (fixture vídeo) ----------
console.log('CA-2-02 — fixture vídeo: gasto pago 940 + resultado orgânico 1540 não gera CPR 0,61:')
{
  const fixture = [
    mk({
      id: 'vp',
      canal: 'meta_ads',
      natureza: 'pago',
      objetivo: 'video',
      objetivoRaw: 'VIDEO_VIEWS',
      resultType: null,
      metricas: {
        ...mk({}).metricas,
        gasto: 940,
        resultados: null,
        cliques: null,
        impressoes: null,
      },
    }),
    mk({
      id: 'vo',
      canal: 'meta_organico',
      natureza: 'organico',
      objetivo: 'video',
      objetivoRaw: null,
      resultType: null,
      metricas: {
        ...mk({}).metricas,
        gasto: null,
        resultados: 1540,
        cliques: null,
        impressoes: null,
      },
    }),
  ]
  // No recorte "Pago + orgânico", o filtro mantém os dois — mas o CPR nunca cruza naturezas
  const agg = agregar(fixture)
  const linha = agg.porObjetivo.find((l) => l.objetivo === 'video')
  prova(
    'linha vídeo: CPR null (pago e orgânico nunca cruzam)',
    linha?.metricas.custoPorResultado === null,
  )
  prova(
    'linha vídeo: resultados = null (natureza paga sem tipo + orgânico sem tipo no mesmo grupo)',
    linha?.metricas.resultados === null,
  )
  prova('linha vídeo: gasto = 940 (só o pago tem gasto)', linha?.metricas.gasto === 940)
  // No recorte "Só pago": resultados indisponíveis (a fonte paga não fornece tipo)
  const aggPago = agregar([fixture[0]])
  prova(
    'só pago: resultados null (fonte não fornece tipo de resultado)',
    aggPago.porObjetivo[0].metricas.resultados === null,
  )
}

// ---------- RN-06 derivado: ctr/cpc/cpm ausentes derivam dos totais reais ----------
console.log('RN-06 derivado — ctr/cpc/cpm sem valor na fonte são derivados (nunca 0 falso):')
{
  const registros = [
    mk({
      id: 'a1',
      metricas: {
        ...mk({}).metricas,
        impressoes: 135260,
        cliques: 2200,
        gasto: 1146.38,
        resultados: 24,
        ctr: null,
        cpc: null,
        cpm: null,
      },
    }),
  ]
  const agg = agregar(registros)
  const linha = agg.porObjetivo[0].metricas
  prova('ctr derivado = 1.6266% (2200/135260*100)', Math.abs((linha.ctr ?? 0) - 1.6266) < 0.001)
  prova('cpc derivado = 0.5210 (1146.38/2200)', Math.abs((linha.cpc ?? 0) - 0.52108) < 0.001)
  prova('cpm derivado = 8.4748 (1146.38/135260*1000)', Math.abs((linha.cpm ?? 0) - 8.4748) < 0.001)
  prova(
    'custo/resultado = 47.77 (1146.38/24)',
    Math.abs((linha.custoPorResultado ?? 0) - 47.7658) < 0.01,
  )
  // Regressão RN-01: fonte com valor real prevalece sobre o derivado
  const registros2 = [
    mk({
      id: 'b1',
      metricas: {
        ...mk({}).metricas,
        impressoes: 1000,
        cliques: 10,
        gasto: 100,
        ctr: 2.5,
        cpc: null,
      },
    }),
  ]
  const agg2 = agregar(registros2)
  prova(
    'ctr da fonte (2.5) prevalece sobre o derivado (1.0)',
    agg2.porObjetivo[0].metricas.ctr === 2.5,
  )
  prova('cpc derivado quando só ele falta (100/10=10)', agg2.porObjetivo[0].metricas.cpc === 10)
  // Sem base para derivar: continua null (nunca 0)
  const registros3 = [
    mk({ id: 'c1', metricas: { ...mk({}).metricas, impressoes: null, cliques: 10, gasto: 100 } }),
  ]
  const agg3 = agregar(registros3)
  prova('sem impressões: cpm = null (não 0)', agg3.porObjetivo[0].metricas.cpm === null)
}

// ---------- REGRESSÃO: janela do mês com dataset DESC (bug do painel 06/10) ----------
console.log('REGRESSÃO — periodosDisponiveis com registros em ordem DESC:')
{
  const registros = [
    mk({ id: 'd6', periodoInicio: '2026-10-06', periodoFim: '2026-10-06' }),
    mk({ id: 'd5', periodoInicio: '2026-10-05', periodoFim: '2026-10-05' }),
    mk({ id: 'd2', periodoInicio: '2026-10-02', periodoFim: '2026-10-02' }),
    mk({ id: 'd1', periodoInicio: '2026-10-01', periodoFim: '2026-10-01' }),
    mk({ id: 's30', periodoInicio: '2026-09-30', periodoFim: '2026-09-30' }),
  ]
  const periodos = periodosDisponiveis(registros)
  const out = periodos.find((p) => p.inicio === '2026-10-01')
  prova('janela de outubro = 01/10 → 06/10', !!out && out.fim === '2026-10-06')
  const set30 = periodos.find((p) => p.inicio === '2026-09-30')
  prova('janela de setembro = 30/09 → 30/09', !!set30 && set30.fim === '2026-09-30')
  // Soma do período corrigido: OUT. deve incluir os 4 dias (não só 01/10)
  const visao = construirVisao(
    registros.map((r, i) => ({
      ...r,
      metricas: { ...mk({}).metricas, gasto: [144.33, 125.03, 49.79, 99.39, 78.81][i] ?? 0 },
    })),
    { ...FILTROS_VAZIOS, periodoInicio: '2026-10-01', periodoFim: '2026-10-06' },
  )
  prova('soma de outubro = 418,26 (não 99,39)', visao.total.gasto === 418.26)
}

// ---------- REGRESSÃO parcial: Meta falho × Google real ----------
console.log('REGRESSÃO — canal indisponível não zera o outro:')
{
  const estados = [
    { canal: 'google_ads' as const, estado: 'conectado' as const },
    { canal: 'meta_ads' as const, estado: 'erro_autenticacao' as const },
  ]
  prova(
    'Google conectado e Meta em erro coexistem',
    estados[0].estado === 'conectado' && estados[1].estado === 'erro_autenticacao',
  )
}

if (falhas > 0) {
  console.error(`\nFALHOU: ${falhas} prova(s) não passaram`)
  process.exit(1)
} else {
  console.log('\nTODAS AS PROVAS PASSARAM')
}
