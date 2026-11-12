routerAdd(
  'GET',
  '/backend/v1/check/delivery-meta',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const evs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_eventos'),
      "created>='2026-11-12 14:20'",
      '',
      200,
      0,
    )
    const out = []
    for (const x of evs)
      out.push({
        ev: String(x.get('evento') || ''),
        q: String(x.get('created') || '').slice(11, 19),
        cod: String(x.get('codigo_erro') || '').slice(0, 80),
        ref: String(x.get('ref_id') || '').slice(0, 20),
      })
    out.sort(function (a, b) {
      return a.q < b.q ? 1 : -1
    })
    return e.json(200, { n: evs.length, ultimos: out.slice(0, 8) })
  },
  $apis.requireAuth(),
)
