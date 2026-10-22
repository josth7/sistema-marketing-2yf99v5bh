/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0060 — autodate created/updated nas coleções novas da fase 4.
 *
 * Coleções criadas com fields plain objects (0056/0058/0059) ficaram SEM os
 * campos system created/updated (autodate) — get('created') devolve vazio e o
 * lead time / ordenação por data não funcionam. Esta migração adiciona os
 * campos autodate às 4 coleções.
 */

migrate(
  (app) => {
    const colecoes = ['crm_leads', 'crm_lead_events', 'conversion_events', 'concorrentes_obs']
    for (const nome of colecoes) {
      let col
      try {
        col = app.findCollectionByNameOrId(nome)
      } catch (_) {
        continue
      }
      let mudou = false
      let temCreated = false
      let temUpdated = false
      try {
        temCreated = !!col.fields.getByName('created')
      } catch (e1) {}
      try {
        temUpdated = !!col.fields.getByName('updated')
      } catch (e2) {}
      if (!temCreated) {
        col.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }))
        mudou = true
      }
      if (!temUpdated) {
        col.fields.add(new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }))
        mudou = true
      }
      if (mudou) {
        app.save(col)
        console.log('0060: autodate adicionado a ' + nome)
      }
    }
  },
  (app) => {
    // rollback: remove os autodate (best-effort)
    const colecoes = ['crm_leads', 'crm_lead_events', 'conversion_events', 'concorrentes_obs']
    for (const nome of colecoes) {
      try {
        const col = app.findCollectionByNameOrId(nome)
        let mudou = false
        try {
          if (col.fields.getByName('created')) {
            col.fields.removeByName('created')
            mudou = true
          }
        } catch (e1) {}
        try {
          if (col.fields.getByName('updated')) {
            col.fields.removeByName('updated')
            mudou = true
          }
        } catch (e2) {}
        if (mudou) app.save(col)
      } catch (e3) {}
    }
  },
)
