routerAdd(
  'GET',
  '/backend/v1/atendimento/ultimas-respostas',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const msgs = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_mensagens'),
      "direcao='saida' && autor='ia'",
      '',
      200,
      0,
    )
    const out = []
    for (const m of msgs.slice(0, 8))
      out.push({
        texto: String(m.get('texto') || '').slice(0, 80),
        quando: String(m.get('created') || '').slice(0, 16),
      })
    return e.json(200, { total: msgs.length, ultimas: out })
  },
  $apis.requireAuth(),
)
