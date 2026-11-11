routerAdd(
  'GET',
  '/backend/v1/empresas/internos-prova',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const its = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_numeros_internos'),
      '',
      '',
      60,
      0,
    )
    const out = []
    for (const i of its)
      out.push({
        numero: String(i.get('numero') || ''),
        rotulo: String(i.get('rotulo') || '').slice(0, 34),
      })
    return e.json(200, { n: its.length, itens: out })
  },
  $apis.requireAuth(),
)
