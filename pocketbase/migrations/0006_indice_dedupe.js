/**
 * Migração 0006 — normaliza a chave de dedupe (task 116061e0, debug).
 *
 * Sintoma: re-ingestão falhou com "Value must be unique" para campos que não
 * deveriam ser únicos. Causa raiz: o SQLite não recria o índice com o mesmo
 * nome quando a definição muda; a recriação das coleções na 0005 deixou o
 * índice único aplicado campo a campo (comportamento observado no erro).
 * Correção: dropar o índice antigo e recriar com nome novo e definição correta
 * (origem, canal, campanha_id, data). Dados preservados.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('metricas_diarias')
    const idxs = col.indexes || []
    const mantidos = []
    for (const i of idxs) {
      if (i.indexOf('idx_metricas_unica') === -1) mantidos.push(i)
    }
    mantidos.push(
      'CREATE UNIQUE INDEX IF NOT EXISTS idx_metricas_unica_v2 ON metricas_diarias (origem, canal, campanha_id, data)',
    )
    col.indexes = mantidos
    app.save(col)
    console.log('migração 0006 aplicada: índice de dedupe recriado (idx_metricas_unica_v2)')
  },
  (app) => {
    const col = app.findCollectionByNameOrId('metricas_diarias')
    const idxs = col.indexes || []
    const mantidos = []
    for (const i of idxs) {
      if (i.indexOf('idx_metricas_unica_v2') === -1) mantidos.push(i)
    }
    col.indexes = mantidos
    app.save(col)
    console.log('migração 0006 revertida')
  },
)
