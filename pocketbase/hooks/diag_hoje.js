routerAdd(
  'GET',
  '/backend/v1/diag/hoje',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const hoje = new Date().toISOString().slice(0, 10)
    const msgs = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_mensagens'),
      "created>='2026-11-10'",
      '',
      500,
      0,
    )
    const out = []
    for (const m of msgs.slice(0, 5))
      out.push({
        dir: String(m.get('direcao')),
        criado: String(m.get('created')).slice(0, 16),
        texto: String(m.get('texto') || '').slice(0, 30),
      })
    return e.json(200, { hoje: hoje, msgs_hoje: msgs.length, amostra: out })
  },
  $apis.requireAuth(),
)
