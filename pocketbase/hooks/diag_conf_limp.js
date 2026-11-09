routerAdd(
  'GET',
  '/backend/v1/diag/confere-limpeza',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const col = $app.findCollectionByNameOrId('carteira_contatos')
    const cs = $app.findRecordsByFilter(col, '', '', 120000, 0)
    var marcados = 0,
      vazios = 0,
      numeros = 0
    for (const c of cs) {
      if (String(c.get('origem') || '') !== '') marcados++
      else vazios++
      if (/^\s*\d/.test(String(c.get('nome') || ''))) numeros++
    }
    return e.json(200, {
      total: cs.length,
      com_origem: marcados,
      sem_origem: vazios,
      nome_com_numero: numeros,
    })
  },
  $apis.requireAuth(),
)
