routerAdd(
  'GET',
  '/backend/v1/diag/estado-renv3',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const es = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_envios'),
      "dedupe_key~'renv3|'",
      '',
      20,
      0,
    )
    const nomes = {}
    for (const c of $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_conexoes'),
      '',
      '',
      60,
      0,
    ))
      nomes[c.id] = String(c.get('nome_exibicao') || '')
    const out = []
    for (const en of es) {
      var evs = []
      try {
        const wid = String(en.get('wa_message_id') || '')
        if (wid !== '') {
          const e2 = $app.findRecordsByFilter(
            $app.findCollectionByNameOrId('whatsapp_eventos'),
            "ref_id='" + wid + "'",
            '',
            5,
            0,
          )
          for (const x of e2)
            evs.push(
              String(x.get('evento')) + ':' + String(x.get('codigo_erro') || '').slice(0, 60),
            )
        }
      } catch (e3) {}
      out.push({
        num: nomes[String(en.get('conexao') || '')] || '?',
        dest: String(en.get('destino_telefone') || '').slice(-6),
        est: String(en.get('estado')),
        erro: String(en.get('ultimo_erro') || '').slice(0, 50),
        eventos: evs,
      })
    }
    return e.json(200, { itens: out })
  },
  $apis.requireAuth(),
)
