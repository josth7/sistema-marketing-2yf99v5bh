routerAdd(
  'GET',
  '/backend/v1/check/dup3',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const cvs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conversas'),
      "estado='triagem'",
      '',
      3000,
      0,
    )
    const papel = {}
    const nome = {}
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      '',
      '',
      60,
      0,
    )) {
      papel[c.id] = String(c.get('papel') || '')
      nome[c.id] = String(c.get('nome_exibicao') || '')
    }
    const out = []
    for (const c of cvs) {
      const t = String(c.get('contato_telefone') || '')
      if (t === '') continue
      // tem outra conversa com o mesmo telefone?
      const todas = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "contato_telefone='" + t + "'",
        '',
        10,
        0,
      )
      if (todas.length > 1) {
        const lst = []
        for (const x of todas)
          lst.push({
            papel: papel[String(x.get('conexao') || '')] || '?',
            nome: nome[String(x.get('conexao') || '')] || '',
            estado: String(x.get('estado') || ''),
            msgs: Number(x.get('total_mensagens') || 0),
            ult: String(x.get('ultima_mensagem_em') || '').slice(0, 16),
          })
        out.push({ tel: t.slice(-6), det: lst })
      }
    }
    return e.json(200, { n: out.length, casos: out.slice(0, 5) })
  },
  $apis.requireAuth(),
)
