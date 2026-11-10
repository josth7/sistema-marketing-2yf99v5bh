routerAdd(
  'GET',
  '/backend/v1/diag/ver-central',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const cs = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true",
      '',
      1,
      0,
    )
    if (!cs.length) return e.json(200, { ok: false })
    const c = cs[0]
    var temChave = false
    try {
      const nc = String(c.get('nome_segredo_chave') || '')
      if (nc !== '') temChave = String($secrets.get(nc) || '') !== ''
    } catch (e1) {}
    return e.json(200, {
      ok: true,
      nome_segredo: String(c.get('nome_segredo_chave') || '(vazio)'),
      session_id: String(c.get('session_id') || '(vazio)').slice(0, 20),
      tem_chave: temChave,
    })
  },
  $apis.requireAuth(),
)
