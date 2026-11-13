/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/fx',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, conversas: [] }
    const cvs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conversas'),
      "contato_telefone~'9036170'",
      '',
      10,
      0,
    )
    const centrais = {}
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true && fixture=false",
      '',
      5,
      0,
    ))
      centrais[c.id] = 1
    for (const c of cvs)
      out.conversas.push({
        papel: centrais[String(c.get('conexao') || '')] ? 'central' : 'vendedor',
        estado: String(c.get('estado') || ''),
        fixture: String(c.get('fixture')),
        empresa: String(c.get('empresa') || '').slice(0, 8),
      })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
