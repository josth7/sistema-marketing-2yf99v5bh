routerAdd(
  'GET',
  '/backend/v1/diag/rodizio-tempo',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const colT = $app.findCollectionByNameOrId('whatsapp_transferencias')
    const trs = $app.findRecordsByFilter(colT, "regra='rodizio' && estado='concluida'", '', 6000, 0)
    const nomes = {}
    for (const u of $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('users'),
      '',
      '',
      300,
      0,
    )) {
      nomes[u.id] = String(u.get('name') || u.get('email') || '')
    }
    trs.sort(function (a, b) {
      return String(a.get('created') || '').localeCompare(String(b.get('created') || ''))
    })
    const porDia = {}
    for (const t of trs) {
      const d = String(t.get('created') || '').slice(0, 10)
      const n = nomes[String(t.get('vendedor_user') || '')] || '?'
      if (!porDia[d]) porDia[d] = {}
      porDia[d][n] = (porDia[d][n] || 0) + 1
    }
    return e.json(200, { total: trs.length, por_dia: porDia })
  },
  $apis.requireAuth(),
)
