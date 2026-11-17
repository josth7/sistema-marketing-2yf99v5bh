/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/id-lead',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true }
    const ls = app.findRecordsByFilter(
      app.findCollectionByNameOrId('crm_leads'),
      "nome~'TESTE ITEM2'",
      '',
      5,
      0,
    )
    out.leads = []
    for (const l of ls)
      out.leads.push({
        id: l.id,
        nome: String(l.get('nome') || ''),
        dono: String(l.get('owner_id') || '').slice(0, 12),
        fixture: String(l.get('fixture')),
      })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
