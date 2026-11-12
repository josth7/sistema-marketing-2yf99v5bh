routerAdd(
  'GET',
  '/backend/v1/check/dois-leads',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = []
    for (const tel of ['862228', '239304']) {
      const ls = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        "telefone~'" + tel + "'",
        '',
        3,
        0,
      )
      for (const l of ls) {
        var convs = []
        try {
          const cs = app.findRecordsByFilter(
            app.findCollectionByNameOrId('whatsapp_conversas'),
            "lead='" + l.id + "'",
            '',
            5,
            0,
          )
          for (const c of cs)
            convs.push({
              estado: String(c.get('estado') || ''),
              ult: String(c.get('ultima_mensagem_em') || '').slice(0, 16),
              cx: String(c.get('conexao') || '').slice(0, 8),
            })
        } catch (e1) {}
        out.push({
          nome: String(l.get('nome') || ''),
          tel: tel,
          dono: String(l.get('owner_id') || ''),
          status: String(l.get('status') || ''),
          criado: String(l.get('created') || '').slice(0, 16),
          conversas: convs,
        })
      }
    }
    return e.json(200, { itens: out })
  },
  $apis.requireAuth(),
)
