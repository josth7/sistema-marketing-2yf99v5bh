/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/detalhe3',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, casos: [] }
    var central = null
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true && fixture=false",
      '',
      1,
      0,
    ))
      central = c
    if (!central) return e.json(200, { ok: false })
    for (const tel of ['413993', '633012', '081854']) {
      const cvs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "conexao='" + central.id + "' && contato_telefone~'" + tel + "'",
        '',
        3,
        0,
      )
      for (const c of cvs) {
        const ms = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_mensagens'),
          "conexao='" +
            central.id +
            "' && contato_telefone='" +
            String(c.get('contato_telefone')) +
            "'",
          '',
          40,
          0,
        )
        const lst = []
        for (const m of ms)
          lst.push(
            String(m.get('created') || '').slice(11, 19) +
              ' ' +
              String(m.get('direcao') || '') +
              ' ' +
              String(m.get('autor') || '') +
              ' ' +
              String(m.get('texto') || '').slice(0, 30),
          )
        lst.sort()
        out.casos.push({
          tel: tel,
          estado: String(c.get('estado') || ''),
          etapa: String(c.get('etapa_atual') || ''),
          ultimo: String(c.get('ultimo_autor') || ''),
          msgs: lst.slice(-3),
        })
      }
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
