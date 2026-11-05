/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0135 — remove o lead de teste da prova do CA-3-72 (05/11).
 */
migrate(
  (app) => {
    const colL = app.findCollectionByNameOrId('crm_leads')
    const colEv = app.findCollectionByNameOrId('crm_lead_events')
    var removeu = 0
    try {
      const ls = app.findRecordsByFilter(colL, "telefone='5541998000077'", '', 5, 0)
      for (const l of ls) {
        try {
          const es = app.findRecordsByFilter(colEv, "lead_id='" + l.id + "'", '', 50, 0)
          for (const e of es) {
            try {
              app.delete(e)
            } catch (a) {}
          }
        } catch (b) {}
        try {
          app.delete(l)
          removeu++
        } catch (c) {}
      }
    } catch (e0) {}
    console.log('0135: leads de teste removidos = ' + removeu)
  },
  (app) => {
    console.log('0135 revertida')
  },
)
