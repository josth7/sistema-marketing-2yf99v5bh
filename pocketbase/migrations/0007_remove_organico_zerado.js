/**
 * Migração 0007 — remove registros orgânicos zerados (RN-06, task 116061e0).
 *
 * A primeira ingestão com o token novo gravou linhas de orgânico com todas as
 * métricas 0 (a API respondeu 200 mas sem valores reais — página sem insights
 * no período). RN-06: ausência não é zero. Remove as 2 linhas zeradas; o hook
 * corrigido (v0.0.22+) não volta a gravá-las.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('metricas_diarias')
    const alvo = app.findRecordsByFilter(col, "objetivo='organico'", '', 50, 0)
    let removidos = 0
    for (const r of alvo) {
      const impr = r.get('impressoes')
      const alc = r.get('alcance')
      const cli = r.get('cliques')
      const gasto = r.get('gasto')
      const tudoZero =
        (impr === null || impr === 0) &&
        (alc === null || alc === 0) &&
        (cli === null || cli === 0) &&
        (gasto === null || gasto === 0)
      if (tudoZero) {
        app.delete(r)
        removidos++
      }
    }
    console.log(
      'migração 0007 aplicada: ' + removidos + ' registro(s) orgânico(s) zerado(s) removido(s)',
    )
  },
  (app) => {
    console.log(
      'migração 0007 revertida (registros removidos não são restaurados — re-ingestão recria se houver dados)',
    )
  },
)
