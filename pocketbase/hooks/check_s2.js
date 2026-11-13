/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/s2',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, apres: [] }
    const ap = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "motivo='apresentacao_vendedor' && created>='2026-11-12 18:00'",
      '',
      100,
      0,
    )
    for (const x of ap)
      out.apres.push({
        q: String(x.get('created') || '').slice(5, 16),
        dest: String(x.get('destino_telefone') || '').slice(-6),
        est: String(x.get('estado') || ''),
        erro: String(x.get('ultimo_erro') || '').slice(0, 45),
        wamid: String(x.get('wa_message_id') || '') !== '',
        modelo: String(x.get('modelo_nome') || '').slice(0, 30),
      })
    out.apres.sort(function (a, b) {
      return a.q < b.q ? -1 : 1
    })
    // o que aconteceu com o envio que DEU CERTO (036170 as 20:36)?
    const okEnv = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "motivo='apresentacao_vendedor' && estado='enviado'",
      '',
      20,
      0,
    )
    out.enviados = []
    for (const x of okEnv)
      out.enviados.push({
        q: String(x.get('created') || '').slice(5, 16),
        dest: String(x.get('destino_telefone') || '').slice(-6),
        wamid: String(x.get('wa_message_id') || '').slice(-12),
      })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
