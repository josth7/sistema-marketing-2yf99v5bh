/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0125 — limpeza da prova de envio do vendedor (04/11).
 *
 * A 0124 criou conversa, mensagem e um envio na fila no número de teste
 * 5541999000088, atribuído à conexão do Fábio. A prova passou: o envio saiu
 * pelo número do vendedor com estado `enviado` e sem erro — era o que faltava
 * para o vendedor conseguir responder pelo sistema.
 *
 * Aqui sai tudo o que a prova criou. Nada real é tocado.
 */
migrate(
  (app) => {
    const TELEFONE = '5541999000088'

    var msgs = 0
    var envs = 0
    var convs = 0
    var leads = 0
    var evs = 0

    // mensagens
    try {
      const l = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "contato_telefone='" + TELEFONE + "'",
        '',
        100,
        0,
      )
      for (const m of l) {
        try {
          app.delete(m)
          msgs++
        } catch (e1) {}
      }
    } catch (e0) {}

    // envios
    try {
      const l = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        "destino_telefone='" + TELEFONE + "'",
        '',
        50,
        0,
      )
      for (const x of l) {
        try {
          app.delete(x)
          envs++
        } catch (e2) {}
      }
    } catch (e3) {}

    // lead, se houver
    var ids = []
    try {
      const l = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        "telefone='" + TELEFONE + "'",
        '',
        5,
        0,
      )
      for (const x of l) ids.push(x.id)
    } catch (e4) {}
    if (ids.length > 0) {
      const colEv = app.findCollectionByNameOrId('crm_lead_events')
      for (const id of ids) {
        try {
          const es = app.findRecordsByFilter(colEv, "lead_id='" + id + "'", '', 100, 0)
          for (const ev of es) {
            try {
              app.delete(ev)
              evs++
            } catch (e5) {}
          }
        } catch (e6) {}
        try {
          app.delete(app.findRecordById('crm_leads', id))
          leads++
        } catch (e7) {}
      }
    }

    // conversas
    try {
      const l = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "contato_telefone='" + TELEFONE + "'",
        '',
        10,
        0,
      )
      for (const c of l) {
        try {
          app.delete(c)
          convs++
        } catch (e8) {}
      }
    } catch (e9) {}

    console.log(
      '0125: limpeza -> conversas=' +
        convs +
        ' mensagens=' +
        msgs +
        ' envios=' +
        envs +
        ' leads=' +
        leads +
        ' eventos=' +
        evs,
    )
  },
  (app) => {
    console.log('0125 revertida')
  },
)
