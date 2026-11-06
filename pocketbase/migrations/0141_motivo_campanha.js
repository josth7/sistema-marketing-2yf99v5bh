/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0141 — motivo `campanha` e estado `cancelado` (CA-3-54, 06/11).
 *
 * O cron do disparo enfileira com motivo `campanha`, mas esse valor NÃO existia
 * no select de `whatsapp_envios.motivo` — o save seria recusado em silêncio e
 * nenhuma campanha sairia (mesmo defeito do `ia_roteiro` em 04/11).
 *
 * Regra da casa: valor novo de select só com migração que o acrescente.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_envios')
    try {
      for (const f of col.fields || []) {
        if (String(f.name) !== 'motivo') continue
        const vals = f.values || []
        if (vals.indexOf('campanha') < 0) {
          f.values = vals.concat(['campanha'])
          console.log('0141: motivo campanha acrescentado')
        }
        if (vals.indexOf('recontato') < 0) {
          f.values = f.values.concat(['recontato'])
          console.log('0141: motivo recontato acrescentado')
        }
      }
      app.save(col)
      console.log('0141: pronto')
    } catch (e0) {
      console.log('0141: falhou -> ' + String(e0).slice(0, 160))
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('whatsapp_envios')
      for (const f of col.fields || []) {
        if (String(f.name) !== 'motivo') continue
        f.values = (f.values || []).filter(function (v) {
          return v !== 'campanha' && v !== 'recontato'
        })
      }
      app.save(col)
    } catch (e) {}
  },
)
