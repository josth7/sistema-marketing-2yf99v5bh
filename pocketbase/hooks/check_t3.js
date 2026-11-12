/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/t3',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, envios: [] }
    const env = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "destino_telefone~'9036170' && created>='2026-11-12 19:55'",
      '',
      30,
      0,
    )
    for (const x of env)
      out.envios.push({
        q: String(x.get('created') || '').slice(11, 19),
        motivo: String(x.get('motivo') || ''),
        estado: String(x.get('estado') || ''),
        erro: String(x.get('ultimo_erro') || '').slice(0, 50),
        texto: String(x.get('texto') || '').slice(0, 60),
        wamid: String(x.get('wa_message_id') || '') !== '',
      })
    out.envios.sort(function (a, b) {
      return a.q < b.q ? 1 : -1
    })
    // as mensagens de SAIDA dessa conversa
    const ms = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "contato_telefone~'9036170' && direcao='saida'",
      '',
      40,
      0,
    )
    out.saidas = []
    for (const m of ms)
      out.saidas.push({
        q: String(m.get('created') || '').slice(11, 19),
        autor: String(m.get('autor') || ''),
        txt: String(m.get('texto') || '').slice(0, 50),
      })
    out.saidas.sort(function (a, b) {
      return a.q < b.q ? 1 : -1
    })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
