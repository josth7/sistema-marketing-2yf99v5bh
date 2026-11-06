/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0153 — motivo `resumo_gestao` no select (CA-3-49, 06/11).
 *
 * O resumo periódico da gestão precisa de um motivo próprio na fila de envios.
 * Sem o valor no select, o `save` é RECUSADO em silêncio e nada sai — foi o
 * que aconteceu com `ia_roteiro` em 04/11 e com `campanha` hoje.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_envios')
    try {
      for (const f of col.fields || []) {
        if (String(f.name) !== 'motivo') continue
        const vals = f.values || []
        if (vals.indexOf('resumo_gestao') < 0) {
          f.values = vals.concat(['resumo_gestao'])
          console.log('0153: motivo resumo_gestao acrescentado')
        } else {
          console.log('0153: resumo_gestao ja existia')
        }
      }
      app.save(col)
      console.log('0153: pronto')
    } catch (e0) {
      console.log('0153: falhou -> ' + String(e0).slice(0, 150))
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('whatsapp_envios')
      for (const f of col.fields || []) {
        if (String(f.name) !== 'motivo') continue
        f.values = (f.values || []).filter(function (v) {
          return v !== 'resumo_gestao'
        })
      }
      app.save(col)
    } catch (e) {}
  },
)
