routerAdd(
  'GET',
  '/backend/v1/diag/msgs-por-dia',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const msgs = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_mensagens'),
      "direcao='entrada'",
      '',
      4000,
      0,
    )
    const porDia = {}
    for (const m of msgs) {
      const c = String(m.get('created') || '').slice(0, 10)
      if (c === '') continue
      porDia[c] = (porDia[c] || 0) + 1
    }
    return e.json(200, { total: msgs.length, por_dia: porDia })
  },
  $apis.requireAuth(),
)
