/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0123 — limpeza da prova de RP-03/RP-04 (04/11).
 *
 * A 0122 criou a conversa de teste 5541999000099 para provar que o robô
 * responde e que o texto do painel chega na resposta. A prova passou:
 *   mensagem 20:11:46 -> decisão 20:12:00 -> fila `ia_resposta` `enviado`.
 *
 * Aqui sai tudo o que a prova criou, para não sobrar conversa fantasma na
 * central nem lead de mentira na base:
 *   - mensagens do telefone de teste
 *   - envios da fila com esse destino
 *   - eventos do lead, se a conversa criou um
 *   - o lead, se existir
 *   - a conversa
 *
 * Nada real é tocado: o filtro é o telefone descartável 5541999000099.
 */
migrate(
  (app) => {
    const TELEFONE = '5541999000099'
    const colCv = app.findCollectionByNameOrId('whatsapp_conversas')
    const colMsg = app.findCollectionByNameOrId('whatsapp_mensagens')
    const colEnv = app.findCollectionByNameOrId('whatsapp_envios')

    var msgs = 0
    var envs = 0
    var convs = 0
    var leads = 0
    var evs = 0

    // ---------- mensagens ----------
    try {
      const l = app.findRecordsByFilter(colMsg, "contato_telefone='" + TELEFONE + "'", '', 100, 0)
      for (const m of l) {
        try {
          app.delete(m)
          msgs++
        } catch (e1) {}
      }
    } catch (e0) {}

    // ---------- envios ----------
    try {
      const l = app.findRecordsByFilter(colEnv, "destino_telefone='" + TELEFONE + "'", '', 50, 0)
      for (const x of l) {
        try {
          app.delete(x)
          envs++
        } catch (e2) {}
      }
    } catch (e3) {}

    // ---------- lead (se a conversa criou um) ----------
    var leadIds = []
    try {
      const l = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        "telefone='" + TELEFONE + "'",
        '',
        5,
        0,
      )
      for (const x of l) leadIds.push(x.id)
    } catch (e4) {}

    if (leadIds.length > 0) {
      const colEv = app.findCollectionByNameOrId('crm_lead_events')
      for (const id of leadIds) {
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

    // ---------- conversa ----------
    try {
      const l = app.findRecordsByFilter(colCv, "contato_telefone='" + TELEFONE + "'", '', 10, 0)
      for (const c of l) {
        try {
          app.delete(c)
          convs++
        } catch (e8) {}
      }
    } catch (e9) {}

    console.log(
      '0123: limpeza -> conversas=' +
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
    console.log('0123 revertida')
  },
)
