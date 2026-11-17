/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/verif-cons',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true }
    const us = app.findRecordsByFilter(
      app.findCollectionByNameOrId('users'),
      "email='rodrigo@adapta.org'",
      '',
      1,
      0,
    )
    if (!us.length) return e.json(200, { ok: false })
    const u = us[0]
    out.usuario = { nome: String(u.get('name') || '(VAZIO)'), email: String(u.get('email') || '') }
    // o acesso dele continua?
    const gs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('access_grants'),
      "user_id='" + u.id + "' && revoked_at=''",
      '',
      5,
      0,
    )
    out.acessos = []
    for (const g of gs)
      out.acessos.push({
        role: String(g.get('role') || ''),
        empresa: String(g.get('empresa') || '').slice(0, 8),
      })
    // ele aparece como vendedor na tela de acessos por numero?
    const cxs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "vendedor_user='" + u.id + "'",
      '',
      5,
      0,
    )
    out.conexoes = cxs.length
    // alguma transferencia nova com email no nome?
    var comEmail = 0
    for (const t of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_transferencias'),
      '',
      '-created',
      600,
      0,
    ))
      if (String(t.get('vendedor_nome') || '').indexOf('@') >= 0) comEmail++
    out.transferencias_com_email = comEmail
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
