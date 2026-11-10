routerAdd(
  'GET',
  '/backend/v1/diag/ev-hoje',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const evs = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_eventos'),
      "created>='2026-11-10'",
      '',
      300,
      0,
    )
    const porEv = {}
    for (const ev of evs) {
      const k = String(ev.get('evento') || '?')
      porEv[k] = (porEv[k] || 0) + 1
    }
    return e.json(200, { hoje: evs.length, por_evento: porEv })
  },
  $apis.requireAuth(),
)
