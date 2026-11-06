/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0142 — remove a campanha de prova do disparo (06/11).
 *
 * A prova criou a campanha "Prova Disparo" com 1.846 destinos na fila. Como o
 * cron **envia de verdade a partir de 7h**, ela precisa sair ANTES de o
 * relógio chegar na janela — senão mandaria mensagem em massa para clientes
 * reais com um modelo que não existe.
 *
 * Apaga: os destinos, os envios e a campanha.
 */
migrate(
  (app) => {
    var campanhas = 0
    var destinos = 0
    var envios = 0
    try {
      const colC = app.findCollectionByNameOrId('campanhas')
      const cs = app.findRecordsByFilter(colC, "nome='Prova Disparo'", '', 20, 0)
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
          const colE = app.findCollectionByNameOrId('whatsapp_envios')
          const es = app.findRecordsByFilter(colE, "motivo='campanha'", '', 5000, 0)
          for (const e of es) {
            try {
              app.delete(e)
              envios++
            } catch (c2) {}
          }
        } catch (d2) {}
        try {
          app.delete(c)
          campanhas++
        } catch (e2) {}
      }
    } catch (e0) {}
    console.log('0142: campanhas=' + campanhas + ' destinos=' + destinos + ' envios=' + envios)
  },
  (app) => {
    console.log('0142 revertida')
  },
)
