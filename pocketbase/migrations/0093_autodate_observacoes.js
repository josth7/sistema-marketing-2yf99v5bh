/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0093 — created/updated nas coleções novas (30/10).
 *
 * `whatsapp_observacoes` e `whatsapp_midia` nasceram da 0092 SEM os campos de
 * sistema `created`/`updated`: a construção por objeto simples não os inclui.
 *
 * Sem `created`, o sort `-created` da rota de observações FALHA em silêncio
 * (o try/catch engole) e a rota devolve total=0 — o recado era GRAVADO e
 * ninguém conseguia ler. Descoberto na prova de 30/10.
 */

migrate(
  (app) => {
    const nomes = ['whatsapp_observacoes', 'whatsapp_midia']
    for (const nome of nomes) {
      var col = null
      try {
        col = app.findCollectionByNameOrId(nome)
      } catch (e0) {
        console.log('0093: ' + nome + ' nao encontrada')
        continue
      }
      var temCreated = false
      var temUpdated = false
      for (const f of col.fields) {
        if (f.name === 'created') temCreated = true
        if (f.name === 'updated') temUpdated = true
      }
      var mudou = false
      if (!temCreated) {
        col.fields.add(new AutodateField({ name: 'created', onCreate: true, onUpdate: false }))
        mudou = true
      }
      if (!temUpdated) {
        col.fields.add(new AutodateField({ name: 'updated', onCreate: false, onUpdate: true }))
        mudou = true
      }
      if (mudou) {
        try {
          app.save(col)
          console.log('0093: created/updated garantidos em ' + nome)
        } catch (e1) {
          console.log('0093: falhou em ' + nome + ' -> ' + String(e1).slice(0, 180))
        }
      } else {
        console.log('0093: ' + nome + ' ja tinha created/updated')
      }
    }
  },
  (app) => {
    console.log('0093 revertida')
  },
)
