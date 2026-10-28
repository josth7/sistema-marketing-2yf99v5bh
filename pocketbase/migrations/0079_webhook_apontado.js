/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0079 — `webhook_apontado_em` em whatsapp_conexoes (CA-3-24/piloto).
 *
 * Registra quando o sistema configurou o webhook da conexão na D-API por API,
 * para a gestão poder conferir sem abrir a tela da D-API. Guarda a DATA, nunca
 * a URL (a URL contém o token).
 *
 * Lição do projeto: campos de coleção são plain objects {name, type} — um
 * construtor tipado dentro de `new Collection` é descartado silenciosamente.
 */

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_conexoes')
    if (col.fields.getByName('webhook_apontado_em')) {
      console.log('0079: campo já existe')
      return
    }
    col.fields.add(new TextField({ name: 'webhook_apontado_em', max: 40 }))
    app.save(col)
    console.log('0079: webhook_apontado_em criado')
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('whatsapp_conexoes')
      col.fields.removeByName('webhook_apontado_em')
      app.save(col)
    } catch (e) {}
    console.log('0079 revertida')
  },
)
