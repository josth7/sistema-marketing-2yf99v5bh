routerAdd(
  'GET',
  '/backend/v1/diag/del-internos',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const evs = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_eventos'),
      "evento='message.delivered'",
      '',
      300,
      0,
    )
    const out = []
    for (const ev of evs) {
      out.push({
        ref: String(ev.get('ref_id') || '').slice(0, 22),
        quando: String(ev.get('recebido_em') || '').slice(0, 16),
      })
    }
    out.sort(function (a, b) {
      return a.quando < b.quando ? 1 : -1
    })
    return e.json(200, { n: evs.length, ultimos: out.slice(0, 6) })
  },
  $apis.requireAuth(),
)
