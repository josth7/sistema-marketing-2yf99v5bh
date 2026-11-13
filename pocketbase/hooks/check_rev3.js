/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/rev3',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, amostra_evento: [], amostra_msg: [], campos_evento: [] }
    // como e um evento de delivered?
    const ent = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_eventos'),
      "evento='message.delivered' && created>='2026-11-13 00:00'",
      '',
      3,
      0,
    )
    for (const x of ent)
      out.amostra_evento.push({
        ref: String(x.get('ref_id') || '').slice(0, 25),
        session: String(x.get('session_id') || '').slice(0, 20),
        tem_msg_id: String(x.get('message_id') || '').slice(0, 20),
      })
    // como e uma mensagem?
    const ms = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "wa_message_id!=''",
      '',
      3,
      0,
    )
    for (const x of ms)
      out.amostra_msg.push({
        wamid: String(x.get('wa_message_id') || '').slice(0, 25),
        autor: String(x.get('autor') || ''),
      })
    // campos da coleção evento
    try {
      const det = $app.findCollectionByNameOrId('whatsapp_eventos')
      for (const f of det.fields || []) out.campos_evento.push(String(f.name))
    } catch (e1) {}
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
