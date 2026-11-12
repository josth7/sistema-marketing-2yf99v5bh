routerAdd(
  'GET',
  '/backend/v1/check/estado-cv',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    var central = ''
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true",
      '',
      1,
      0,
    ))
      central = c.id
    const ent = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "conexao='" + central + "' && direcao='entrada' && created>='2026-11-11 20:00'",
      '',
      50,
      0,
    )
    const out = []
    for (const m of ent) {
      const tel = String(m.get('contato_telefone') || '')
      var est = '',
        ultimo = '',
        iaq = ''
      try {
        const cvs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_conversas'),
          "conexao='" + central + "' && contato_telefone='" + tel + "'",
          '',
          1,
          0,
        )
        if (cvs.length > 0) {
          est = String(cvs[0].get('estado') || '')
          ultimo = String(cvs[0].get('ultimo_autor') || '')
          iaq = String(cvs[0].get('ultima_resposta_ia_em') || '').slice(0, 16)
        }
      } catch (e1) {}
      if (out.length < 6)
        out.push({
          tel: tel.slice(-6),
          q: String(m.get('created') || '').slice(11, 19),
          estado: est,
          ultimo: ultimo,
          iaq: iaq,
          txt: String(m.get('texto') || '').slice(0, 30),
        })
    }
    // config
    var cfg = null
    for (const c of app.findRecordsByFilter('atendimento_config', '', '', 200, 0))
      if (!cfg || Number(c.get('versao') || 0) > Number(cfg.get('versao') || 0)) cfg = c
    return e.json(200, {
      central: central.slice(0, 8),
      cfg_versao: cfg ? Number(cfg.get('versao')) : 0,
      cfg_ligado: cfg ? cfg.get('ligado') === true : false,
      cfg_empresa: cfg ? String(cfg.get('empresa') || '').slice(0, 8) : '',
      amostra: out,
    })
  },
  $apis.requireAuth(),
)
