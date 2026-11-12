routerAdd(
  'GET',
  '/backend/v1/check/erro-completo',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const evs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_eventos'),
      "evento='message.failed' && created>='2026-11-12 14:20'",
      '',
      20,
      0,
    )
    const out = []
    for (const x of evs)
      out.push({
        q: String(x.get('created') || '').slice(11, 19),
        cod: String(x.get('codigo_erro') || '').slice(0, 400),
      })
    out.sort(function (a, b) {
      return a.q < b.q ? 1 : -1
    })
    return e.json(200, { n: evs.length, itens: out.slice(0, 3) })
  },
  $apis.requireAuth(),
)
