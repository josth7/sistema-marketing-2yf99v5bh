/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0152 — limpa as campanhas de prova do CA-3-85 (06/11).
 *
 * Sobraram "Prova Dias" e "Prova Dias2", criadas para conferir se `dias` e
 * `intervalo_dias` gravam. Ficam como lixo na tela e poderiam ser aprovadas
 * por engano. A "pronoção novembro" NÃO é tocada: é rascunho de alguém real.
 */
migrate(
  (app) => {
    var camps = 0
    try {
      const col = app.findCollectionByNameOrId('campanhas')
      const cs = app.findRecordsByFilter(col, "nome ~ 'Prova Dias'", '', 20, 0)
      for (const c of cs) {
        try {
          const colD = app.findCollectionByNameOrId('campanha_destinos')
          const ds = app.findRecordsByFilter(colD, "campanha='" + c.id + "'", '', 5000, 0)
          for (const d of ds) {
            try {
              app.delete(d)
            } catch (a) {}
          }
        } catch (b) {}
        try {
          app.delete(c)
          camps++
        } catch (c2) {}
      }
    } catch (e0) {}
    console.log('0152: campanhas de prova removidas = ' + camps)
  },
  (app) => {
    console.log('0152 revertida')
  },
)
