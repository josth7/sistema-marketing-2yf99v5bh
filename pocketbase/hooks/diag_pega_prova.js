routerAdd(
  'GET',
  '/backend/v1/diag/pega-prova',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const col = $app.findCollectionByNameOrId('whatsapp_conexoes')
    const a = $app.findRecordsByFilter(col, "session_id='prova-apres-ca397'", '', 1, 0)
    if (!a || a.length === 0) return e.json(200, { ok: false, erro: 'nao criada' })
    return e.json(200, {
      ok: true,
      id: a[0].id,
      nome: String(a[0].get('nome_exibicao')),
      chave: String(a[0].get('nome_segredo_chave')),
      ativa: a[0].get('apresentacao_ativa') === true,
    })
  },
  $apis.requireAuth(),
)
