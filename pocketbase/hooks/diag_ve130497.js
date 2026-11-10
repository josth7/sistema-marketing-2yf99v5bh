routerAdd(
  'GET',
  '/backend/v1/diag/ve-130497',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const es = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_eventos'),
      "evento='message.failed' && created>='2026-11-10'",
      '',
      20,
      0,
    )
    const out = []
    for (const x of es)
      out.push({
        quando: String(x.get('recebido_em') || '').slice(0, 16),
        cod: String(x.get('codigo_erro') || '').slice(0, 110),
        res: String(x.get('resultado')),
      })
    return e.json(200, { n: es.length, itens: out })
  },
  $apis.requireAuth(),
)
