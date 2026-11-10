routerAdd(
  'GET',
  '/backend/v1/diag/delivered314',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const evs = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_eventos'),
      "evento='message.delivered'",
      '',
      200,
      0,
    )
    const alvo = 'HBgMNTU0MTk5NjAxMj'
    const out = []
    for (const ev of evs) {
      const ref = String(ev.get('ref_id') || '')
      if (ref.indexOf(alvo) >= 0)
        out.push({
          evento: String(ev.get('evento')),
          ref: ref.slice(0, 20),
          quando: String(ev.get('recebido_em') || ev.get('created') || '').slice(0, 16),
        })
    }
    return e.json(200, { total_eventos: evs.length, achados: out })
  },
  $apis.requireAuth(),
)
