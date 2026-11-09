routerAdd(
  'GET',
  '/backend/v1/diag/olha-um',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const col = $app.findCollectionByNameOrId('carteira_contatos')
    const cs = $app.findRecordsByFilter(col, '', '', 3, 0)
    const out = []
    for (const c of cs) {
      out.push({
        tel: String(c.get('telefone') || '').slice(-6),
        nome: String(c.get('nome') || '').slice(0, 20),
        origem: JSON.stringify(c.get('origem_carteira')),
        lote: String(c.get('lote') || ''),
      })
    }
    return e.json(200, { itens: out })
  },
  $apis.requireAuth(),
)
