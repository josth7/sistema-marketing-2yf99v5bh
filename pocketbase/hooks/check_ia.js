routerAdd(
  'GET',
  '/backend/v1/check/ia-hoje',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const msgs = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_mensagens'),
      "autor='ia' && created>='2026-11-11'",
      '',
      200,
      0,
    )
    const out = []
    for (const m of msgs)
      out.push({
        quando: String(m.get('created') || '').slice(11, 19),
        tel: String(m.get('contato_telefone') || '').slice(-6),
        texto: String(m.get('texto') || '').slice(0, 70),
        dir: String(m.get('direcao') || ''),
      })
    return e.json(200, { n: msgs.length, itens: out })
  },
  $apis.requireAuth(),
)
