/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/webhook-15h',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const evs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_eventos'),
      "created>='2026-11-12 18:00'",
      '',
      400,
      0,
    )
    const out = []
    for (const x of evs)
      out.push({
        q: String(x.get('created') || '').slice(11, 19),
        ev: String(x.get('evento') || ''),
      })
    out.sort(function (a, b) {
      return a.q < b.q ? 1 : -1
    })
    const porEv = {}
    for (const x of out) porEv[x.ev] = (porEv[x.ev] || 0) + 1
    return e.json(200, { total: evs.length, por_evento: porEv, ultimos: out.slice(0, 6) })
  },
  $apis.requireAuth(),
)
