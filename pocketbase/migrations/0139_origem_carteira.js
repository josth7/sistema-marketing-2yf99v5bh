/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0139 — origem `carteira` no lead (CA-3-57, 05/11).
 *
 * A regra do CA-3-57 diz que o contato que está na carteira de um vendedor e
 * escreve para a central nasce com origem **`carteira`**. Esse valor não
 * existia no select de `crm_leads.origem`, então o save era RECUSADO em
 * silêncio — o lead não nascia e o contato ficava sem registro (foi o que a
 * prova pegou).
 *
 * Regra da casa: valor novo de select só com migração que o acrescente.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('crm_leads')
    try {
      for (const f of col.fields || []) {
        if (String(f.name) !== 'origem') continue
        const vals = f.values || []
        if (vals.indexOf('carteira') < 0) {
          f.values = vals.concat(['carteira'])
          console.log('0139: origem carteira acrescentada')
        } else {
          console.log('0139: origem carteira ja existia')
        }
      }
      app.save(col)
      console.log('0139: pronto')
    } catch (e0) {
      console.log('0139: falhou -> ' + String(e0).slice(0, 160))
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('crm_leads')
      for (const f of col.fields || []) {
        if (String(f.name) !== 'origem') continue
        const vals = (f.values || []).filter(function (v) {
          return v !== 'carteira'
        })
        f.values = vals
      }
      app.save(col)
    } catch (e) {}
  },
)
