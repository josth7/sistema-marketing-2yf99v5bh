/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0119 — limpeza dos leads de teste da conversão (04/11).
 *
 * Remove "TESTE Conversao" e "TESTE Conversao 2", criados para provar o bug
 * em que a rota de conversão respondia sucesso e gravava valor ZERO no lead.
 * Nada real é tocado.
 */
migrate(
  (app) => {
    const colL = app.findCollectionByNameOrId('crm_leads')
    const colEv = app.findCollectionByNameOrId('crm_lead_events')
    const colConv = app.findCollectionByNameOrId('conversion_events')

    var alvos = []
    try {
      alvos = app.findRecordsByFilter(colL, "nome~'TESTE Conversao'", '', 50, 0)
    } catch (e0) {}

    var leads = 0
    var evs = 0
    var convs = 0
    for (const l of alvos) {
      try {
        const e1 = app.findRecordsByFilter(colEv, "lead_id='" + l.id + "'", '', 100, 0)
        for (const x of e1) {
          try {
            app.delete(x)
            evs++
          } catch (a) {}
        }
      } catch (e2) {}
      try {
        const c = app.findRecordsByFilter(colConv, "lead_id='" + l.id + "'", '', 50, 0)
        for (const x of c) {
          try {
            app.delete(x)
            convs++
          } catch (b) {}
        }
      } catch (e3) {}
      try {
        app.delete(l)
        leads++
      } catch (e4) {}
    }
    console.log('0119: leads=' + leads + ' eventos=' + evs + ' conversoes=' + convs)
  },
  (app) => {
    console.log('0119 revertida')
  },
)
