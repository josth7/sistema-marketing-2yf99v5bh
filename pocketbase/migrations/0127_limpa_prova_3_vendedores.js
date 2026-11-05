/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0127 — limpeza da prova dos 3 vendedores (05/11).
 *
 * A 0126 provou o envio pelos números de Douglas, Elisangela e Adriana. Os
 * três saíram com estado `enviado`, 1 tentativa e `ultimo_erro` vazio — igual
 * ao Fábio na prova de 04/11 (0124).
 *
 * Aqui sai tudo o que as três provas criaram, para não deixar conversa
 * fantasma na central nem número de teste na base.
 */
migrate(
  (app) => {
    const TELS = ['5541999000077', '5541999000066', '5541999000055']

    var msgs = 0
    var envs = 0
    var convs = 0
    var leads = 0
    var evs = 0

    const colMsg = app.findCollectionByNameOrId('whatsapp_mensagens')
    const colEnv = app.findCollectionByNameOrId('whatsapp_envios')
    const colCv = app.findCollectionByNameOrId('whatsapp_conversas')
    const colL = app.findCollectionByNameOrId('crm_leads')
    const colEv = app.findCollectionByNameOrId('crm_lead_events')

    for (const tel of TELS) {
      // mensagens
      try {
        const l = app.findRecordsByFilter(colMsg, "contato_telefone='" + tel + "'", '', 100, 0)
        for (const m of l) {
          try {
            app.delete(m)
            msgs++
          } catch (e1) {}
        }
      } catch (e0) {}

      // envios
      try {
        const l = app.findRecordsByFilter(colEnv, "destino_telefone='" + tel + "'", '', 50, 0)
        for (const x of l) {
          try {
            app.delete(x)
            envs++
          } catch (e2) {}
        }
      } catch (e3) {}

      // lead (se houver)
      var ids = []
      try {
        const l = app.findRecordsByFilter(colL, "telefone='" + tel + "'", '', 5, 0)
        for (const x of l) ids.push(x.id)
      } catch (e4) {}
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

      // conversas
      try {
        const l = app.findRecordsByFilter(colCv, "contato_telefone='" + tel + "'", '', 10, 0)
        for (const c of l) {
          try {
            app.delete(c)
            convs++
          } catch (e8) {}
        }
      } catch (e9) {}
    }

    console.log(
      '0127: limpeza -> conversas=' +
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
    console.log('0127 revertida')
  },
)
