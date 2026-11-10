routerAdd(
  'GET',
  '/backend/v1/diag/payload-failed',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const es = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_eventos'),
      "evento='message.failed'",
      '',
      10,
      0,
    )
    const out = []
    for (const x of es) {
      out.push({
        cod: String(x.get('codigo_erro') || '').slice(0, 300),
        res: String(x.get('resultado') || ''),
        quando: String(x.get('recebido_em') || '').slice(0, 16),
      })
    }
    return e.json(200, { n: es.length, itens: out })
  },
  $apis.requireAuth(),
)
