routerAdd(
  'GET',
  '/backend/v1/check/acha-tel',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const out = []
    for (const c of $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_conversas'),
      "contato_telefone~'150967'",
      '',
      3,
      0,
    ))
      out.push({
        estado: String(c.get('estado') || ''),
        autor: String(c.get('ultimo_autor') || ''),
        ult: String(c.get('ultima_mensagem_em') || '').slice(0, 16),
        empresa: String(c.get('empresa') || '').slice(0, 8),
      })
    return e.json(200, { itens: out })
  },
  $apis.requireAuth(),
)
