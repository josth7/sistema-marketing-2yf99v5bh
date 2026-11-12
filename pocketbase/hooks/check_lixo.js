routerAdd(
  'GET',
  '/backend/v1/check/lixo-teste',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, importados: [], criados: [] }
    // leads com origem=importacao (os 3 novos do teste)
    const l1 = app.findRecordsByFilter(
      app.findCollectionByNameOrId('crm_leads'),
      "origem='importacao'",
      '',
      50,
      0,
    )
    for (const l of l1)
      out.criados.push({
        nome: String(l.get('nome') || ''),
        tel: String(l.get('telefone') || ''),
        valor: l.get('valor'),
        id: l.id,
      })
    // os 4 reais que marquei como venda no teste
    for (const tel of [
      '558899898584',
      '554791500408',
      '554398116797',
      '553196123601',
      '5511945894103',
    ]) {
      const ls = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        "telefone='" + tel + "'",
        '',
        2,
        0,
      )
      for (const l of ls)
        if (String(l.get('status')) === 'venda_realizada')
          out.importados.push({
            nome: String(l.get('nome') || ''),
            tel: tel,
            valor: l.get('valor'),
            id: l.id,
          })
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
