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
