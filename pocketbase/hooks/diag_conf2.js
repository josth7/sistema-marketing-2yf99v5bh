routerAdd(
  'GET',
  '/backend/v1/diag/conf2',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const col = $app.findCollectionByNameOrId('carteira_contatos')
    const cs = $app.findRecordsByFilter(col, '', '', 120000, 0)
    var imp = 0,
      vaz = 0,
      outros = 0
    for (const c of cs) {
      const o = JSON.stringify(c.get('origem_carteira') || '')
      if (o.indexOf('importacao') >= 0) imp++
      else if (o === '""') vaz++
      else outros++
    }
    return e.json(200, { total: cs.length, importacao: imp, vazio: vaz, outros: outros })
  },
  $apis.requireAuth(),
)
