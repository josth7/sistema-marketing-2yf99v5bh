routerAdd(
  'GET',
  '/backend/v1/diag/olha-adriana',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const out = {}
    var u = null
    try {
      u = $app.findRecordById('users', 'parpvpjn8j8qkmy')
    } catch (e) {
      return e.json(200, { ok: false, erro: 'user nao achado' })
    }
    out.user = { id: u.id, nome: String(u.get('name') || ''), email: String(u.get('email') || '') }
    // grants
    try {
      const gs = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='parpvpjn8j8qkmy'",
        '',
        10,
        0,
      )
      out.grants = []
      for (const g of gs) {
        out.grants.push({
          role: String(g.get('role') || ''),
          revoked: String(g.get('revoked_at') || ''),
          ate: String(g.get('valid_until') || '').slice(0, 10),
        })
      }
    } catch (e1) {
      out.grantsErro = String(e1).slice(0, 80)
    }
    // conexao
    try {
      const cs = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_conexoes'),
        "vendedor_user='parpvpjn8j8qkmy'",
        '',
        5,
        0,
      )
      out.conexoes = []
      for (const c of cs)
        out.conexoes.push({
          id: c.id,
          nome: String(c.get('nome_exibicao') || ''),
          ativo: c.get('ativo') === true,
          papel: String(c.get('papel') || ''),
        })
    } catch (e2) {
      out.conexErro = String(e2).slice(0, 80)
    }
    // quantos leads tem como dono
    try {
      out.leads = app.findRecordsByFilter(
        $app.findCollectionByNameOrId('crm_leads'),
        "owner_id='parpvpjn8j8qkmy'",
        '',
        2000,
        0,
      ).length
    } catch (e3) {}
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
