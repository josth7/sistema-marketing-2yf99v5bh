routerAdd(
  'GET',
  '/backend/v1/check/conv-fila',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const c = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('conversion_events'),
      "created>='2026-11-12'",
      '',
      200,
      0,
    )
    var imp = 0
    for (const x of c)
      if (String(x.get('origem') || x.get('fonte') || '').indexOf('import') >= 0) imp++
    return e.json(200, { hoje: c.length, de_importacao: imp })
  },
  $apis.requireAuth(),
)
