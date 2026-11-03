/// <reference path="../pb_data/types.d.ts" />
// ===================================================================
// MIG 0103 — destinatarios do aviso de lead por e-mail (03/11).
//
// O WhatsApp esta bloqueado pela Meta (130497), entao o aviso de lead novo
// precisa de outro canal. E-mail nao depende da Meta.
//
// Guarda quem recebe: usuario + e-mail. Se `user_id` preenchido, o cron manda
// SO os leads daquela pessoa; vazio, manda o consolidado (gestao).
// ===================================================================
migrate(
  (app) => {
    var existe = false
    try {
      app.findCollectionByNameOrId('whatsapp_avisos_email')
      existe = true
    } catch (e0) {
      existe = false
    }
    if (existe) {
      console.log('0103: whatsapp_avisos_email já existe')
      return
    }
    const col = new Collection({
      name: 'whatsapp_avisos_email',
      type: 'base',
      listRule: null,
      viewRule: null,
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'email', type: 'text', required: true, max: 200 },
        { name: 'nome', type: 'text', required: false, max: 120 },
        { name: 'user_id', type: 'text', required: false, max: 40 },
        { name: 'ativo', type: 'bool', required: false },
      ],
    })
    try {
      app.save(col)
      console.log('0103: whatsapp_avisos_email criada')
    } catch (e1) {
      console.log('0103: erro ao criar: ' + e1)
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('whatsapp_avisos_email')
      app.delete(col)
    } catch (e0) {}
  },
)
