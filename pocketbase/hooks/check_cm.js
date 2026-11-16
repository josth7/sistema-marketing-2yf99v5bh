/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/campos-msg',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, campos: [] }
    const det = app.findCollectionByNameOrId('whatsapp_mensagens')
    for (const f of det.fields || [])
      out.campos.push({
        nome: String(f.name),
        tipo: String(f.type),
        obrig: !!f.required,
        valores: f.values || null,
      })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
