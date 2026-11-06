routerAdd(
  'GET',
  '/backend/v1/diag/conv-prova',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const col = $app.findCollectionByNameOrId('conversion_events')
    const r = $app.findRecordsByFilter(col, "dedupe_key='conv-prova-capi'", '', 3, 0)
    const out = []
    for (const c of r)
      out.push({
        id: c.id,
        estado: String(c.get('estado')),
        tent: Number(c.get('tentativas') || 0),
        erro: String(c.get('ultimo_erro') || '').slice(0, 120),
        event: String(c.get('event_id') || '').slice(0, 40),
      })
    return e.json(200, { ok: true, n: r.length, itens: out })
  },
  $apis.requireAuth(),
)
