routerAdd(
  'GET',
  '/backend/v1/diag/failed-todos',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const es = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_eventos'),
      "evento='message.failed'",
      '',
      100,
      0,
    )
    const out = []
    for (const x of es)
      out.push({
        q: String(x.get('recebido_em') || x.get('created') || '').slice(0, 16),
        c: String(x.get('codigo_erro') || '').slice(0, 70),
      })
    out.sort(function (a, b) {
      return a.q < b.q ? 1 : -1
    })
    return e.json(200, { n: es.length, ultimos: out.slice(0, 6) })
  },
  $apis.requireAuth(),
)
