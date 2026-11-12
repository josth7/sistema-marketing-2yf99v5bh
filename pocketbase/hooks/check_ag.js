/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/agora',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, agora: new Date().toISOString().slice(0, 19) }
    const colM = app.findCollectionByNameOrId('whatsapp_mensagens')
    out.sabrina_apos_1815 = app.findRecordsByFilter(
      colM,
      "contato_telefone~'9036170' && created>='2026-11-12 18:15'",
      '',
      50,
      0,
    ).length
    out.entradas_apos_1905 = app.findRecordsByFilter(
      colM,
      "direcao='entrada' && created>='2026-11-12 19:05'",
      '',
      200,
      0,
    ).length
    const ia = app.findRecordsByFilter(
      colM,
      "autor='ia' && created>='2026-11-12 19:00'",
      '',
      100,
      0,
    )
    out.ia_apos_16h = ia.length
    const lst = []
    for (const m of ia)
      lst.push(
        String(m.get('created') || '').slice(11, 19) +
          ' -> ' +
          String(m.get('contato_telefone') || '').slice(-6),
      )
    lst.sort()
    out.exemplos = lst.slice(-4)
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
