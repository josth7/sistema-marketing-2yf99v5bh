/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/j3',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, por_conexao: {} }
    const cxs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      'ativo=true',
      '',
      30,
      0,
    )
    const nome = {}
    for (const c of cxs)
      nome[c.id] = String(c.get('nome_exibicao') || '') + ' (' + String(c.get('papel') || '') + ')'
    for (const c of cxs) {
      var n = 0
      try {
        n = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_mensagens'),
          "conexao='" + c.id + "' && direcao='entrada' && created>='2026-11-12 18:15'",
          '',
          500,
          0,
        ).length
      } catch (x) {}
      if (n > 0) out.por_conexao[nome[c.id]] = n
    }
    // ultima entrada DA CENTRAL
    const cs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true && fixture=false",
      '',
      1,
      0,
    )
    if (cs.length > 0) {
      const id = cs[0].id
      const ms = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "conexao='" + id + "' && direcao='entrada' && created>='2026-11-12 18:00'",
        '',
        100,
        0,
      )
      out.central_entradas_apos_1800 = ms.length
      var ult = ''
      for (const m of ms) {
        const q = String(m.get('created') || '')
        if (q > ult) ult = q
      }
      out.central_ultima_entrada = ult.slice(0, 19)
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
