/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0138 — remove a campanha de prova do CA-3-53 (05/11).
 */
migrate(
  (app) => {
    var removeu = 0
    try {
      const colC = app.findCollectionByNameOrId('campanhas')
      const camps = app.findRecordsByFilter(colC, "nome='Prova Campanha'", '', 20, 0)
      for (const c of camps) {
        try {
          const colD = app.findCollectionByNameOrId('campanha_destinos')
          const ds = app.findRecordsByFilter(colD, "campanha='" + c.id + "'", '', 500, 0)
          for (const d of ds) {
            try {
              app.delete(d)
            } catch (a) {}
          }
        } catch (b) {}
        try {
          app.delete(c)
          removeu++
        } catch (c2) {}
      }
    } catch (e0) {}
    console.log('0138: campanhas de prova removidas = ' + removeu)
  },
  (app) => {
    console.log('0138 revertida')
  },
)
