/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0022 — limpa artefatos de teste do tick (card a70d5ab8).
 *
 * Os ticks anteriores rodaram com recipients mortos (IDs divergentes entre
 * ambientes): criaram relatórios delivered SEM entregar a ninguém — artefatos
 * de teste que também travariam o generate manual (409 em não-draft).
 * Limpeza: relatórios scope='fixture' (todos) + scope='' state='delivered'.
 * A política REAL permanece intocada; nada disso é dado real de produção.
 */
migrate(
  (app) => {
    const colR = app.findCollectionByNameOrId('reports')
    const lixo = app.findRecordsByFilter(
      colR,
      "scope='fixture' || (scope='' && state='delivered')",
      '',
      100,
      0,
    )
    let n = 0
    for (const r of lixo) {
      app.delete(r)
      n++
    }
    console.log('migração 0022 aplicada: ' + n + ' artefato(s) de teste removido(s)')
  },
  (app) => {
    console.log('migração 0022 revertida (artefatos de teste não são restaurados)')
  },
)
