routerAdd(
  'GET',
  '/backend/v1/piloto/ultimos-recebidos',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const msgs = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_mensagens'),
      "direcao='entrada'",
      '',
      400,
      0,
    )
    const out = []
    for (const m of msgs)
      out.push({
        tel: String(m.get('contato_telefone') || ''),
        quando: String(m.get('created') || '').slice(0, 16),
      })
    out.sort(function (a, b) {
      return a.quando < b.quando ? 1 : -1
    })
    return e.json(200, { total: msgs.length, ultimos: out.slice(0, 10) })
  },
  $apis.requireAuth(),
)
