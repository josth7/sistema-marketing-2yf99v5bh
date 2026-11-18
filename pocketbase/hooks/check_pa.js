/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/pa-abertos',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, itens: [] }
    for (const p of app.findRecordsByFilter(
      app.findCollectionByNameOrId('precisa_acao'),
      'resolvido=false',
      '-created',
      50,
      0,
    )) {
      out.itens.push({
        id: p.id.slice(0, 8),
        tipo: String(p.get('tipo') || ''),
        motivo: String(p.get('motivo') || '').slice(0, 90),
        lead: String(p.get('lead_id') || '').slice(0, 10),
        criado: String(p.get('created') || '').slice(0, 16),
      })
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
