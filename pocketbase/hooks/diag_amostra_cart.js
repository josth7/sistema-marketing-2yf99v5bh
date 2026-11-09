routerAdd(
  'GET',
  '/backend/v1/diag/amostra-cart',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const col = $app.findCollectionByNameOrId('carteira_contatos')
    const cs = $app.findRecordsByFilter(col, '', '', 5, 0)
    const itens = []
    for (const c of cs) {
      itens.push({
        campos: Object.keys(c)
          .filter(function (k) {
            return k.indexOf('collection') < 0
          })
          .slice(0, 20),
        nome: String(c.get('nome') || ''),
        tel: String(c.get('telefone') || ''),
        vendedor: String(c.get('vendedor_user') || '').slice(0, 10),
        origem: String(c.get('origem') || '(vazio)'),
        criado: String(c.get('created') || '').slice(0, 10),
      })
    }
    return e.json(200, { n: cs.length, itens: itens })
  },
  $apis.requireAuth(),
)
