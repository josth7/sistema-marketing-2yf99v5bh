/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0150 — limpa as campanhas de prova do CA-3-84 (06/11).
 *
 * A prova do ciclo (teste, aprovar, iniciar, pausar, retomar, cancelar) criou
 * 3 campanhas de teste. Duas ficaram com estado "em_andamento" e poderiam
 * começar a disparar quando o cron rodasse. Saem todas.
 */
migrate(
  (app) => {
    var camps = 0
    var destinos = 0
    var envios = 0
    try {
      const colC = app.findCollectionByNameOrId('campanhas')
      const cs = app.findRecordsByFilter(colC, "nome ~ 'Prova Controle'", '', 50, 0)
      for (const c of cs) {
        try {
          const colD = app.findCollectionByNameOrId('campanha_destinos')
          const ds = app.findRecordsByFilter(colD, "campanha='" + c.id + "'", '', 20000, 0)
          for (const d of ds) {
            try {
              app.delete(d)
              destinos++
            } catch (a) {}
          }
        } catch (b) {}
        try {
          app.delete(c)
          camps++
        } catch (c2) {}
      }
    } catch (e0) {}

    // envios de teste que ficaram na fila
    try {
      const colE = app.findCollectionByNameOrId('whatsapp_envios')
      const es = app.findRecordsByFilter(colE, "motivo='teste' && estado='pendente'", '', 5000, 0)
      for (const en of es) {
        try {
          app.delete(en)
          envios++
        } catch (d2) {}
      }
    } catch (e1) {}

    console.log('0150: campanhas=' + camps + ' destinos=' + destinos + ' envios_teste=' + envios)
  },
  (app) => {
    console.log('0150 revertida')
  },
)
