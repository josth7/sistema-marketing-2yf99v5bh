/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/rod-resumo',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true }
    // todas as transferencias com estado sem_numero (erro interno)
    const trs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_transferencias'),
      '',
      '-created',
      600,
      0,
    )
    var semNumero = 0,
      comEmail = 0,
      foraRoteiro = 0
    const lista = []
    for (const t of trs) {
      const est = String(t.get('estado') || '')
      const vn = String(t.get('vendedor_nome') || '')
      if (est === 'sem_numero') semNumero++
      if (vn.indexOf('@') >= 0) {
        comEmail++
        if (lista.length < 10)
          lista.push({
            q: String(t.get('created') || '').slice(0, 16),
            vn: vn,
            est: est,
            det: String(t.get('detalhe') || '').slice(0, 40),
          })
      }
      if (String(t.get('motivo') || '') === 'fora_do_roteiro') foraRoteiro++
    }
    out.total_transferencias = trs.length
    out.sem_numero = semNumero
    out.com_email_no_nome = comEmail
    out.fora_do_roteiro = foraRoteiro
    out.lista_email = lista
    // esse usuario existe ainda?
    var u = null
    try {
      const us = app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        "email='rodrigo@adapta.org'",
        '',
        1,
        0,
      )
      if (us.length > 0) u = us[0]
    } catch (e1) {}
    if (u) {
      out.usuario_rodrigo = {
        id: u.id.slice(0, 10),
        nome: String(u.get('name') || '(VAZIO)'),
        verificado: u.get('verified') === true,
        criado: String(u.get('created') || '').slice(0, 16),
      }
      // o grant dele
      try {
        const gs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('access_grants'),
          "user_id='" + u.id + "'",
          '',
          5,
          0,
        )
        out.grants = []
        for (const g of gs)
          out.grants.push({
            role: String(g.get('role') || ''),
            empresa: String(g.get('empresa') || '').slice(0, 10),
            revogado: String(g.get('revoked_at') || '(ATIVO)'),
          })
      } catch (e2) {}
      // tem conexao?
      try {
        const cs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_conexoes'),
          "vendedor_user='" + u.id + "'",
          '',
          5,
          0,
        )
        out.conexoes = cs.length
      } catch (e3) {
        out.conexoes = 0
      }
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
