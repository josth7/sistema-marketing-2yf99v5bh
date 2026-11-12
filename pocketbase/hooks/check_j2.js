/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/j2',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true }
    const colM = app.findCollectionByNameOrId('whatsapp_mensagens')
    const colE = app.findCollectionByNameOrId('whatsapp_eventos')
    // contagens por filtro de data (autoritativas)
    function c(col, f) {
      try {
        return app.findRecordsByFilter(col, f, '', 1000, 0).length
      } catch (x) {
        return -1
      }
    }
    out.entradas_apos_1815 = c(colM, "direcao='entrada' && created>='2026-11-12 18:15'")
    out.entradas_apos_1830 = c(colM, "direcao='entrada' && created>='2026-11-12 18:30'")
    out.entradas_apos_1900 = c(colM, "direcao='entrada' && created>='2026-11-12 19:00'")
    out.ev_received_apos_1815 = c(colE, "evento='messages.received' && created>='2026-11-12 18:15'")
    out.ev_received_apos_1900 = c(colE, "evento='messages.received' && created>='2026-11-12 19:00'")
    // do numero da sabrina, qualquer coisa depois de 18:15
    out.sabrina_msgs = c(colM, "contato_telefone~'9036170' && created>='2026-11-12 18:15'")
    out.sabrina_total = c(colM, "contato_telefone~'9036170'")
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
