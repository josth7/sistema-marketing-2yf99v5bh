/// <reference path="../pb_data/types.d.ts" />
/**
 * CRIA A CONTA DA AGÊNCIA — rota com resposta imediata (18/11).
 *
 * Por que rota e não migração: as migrações 0132 e 0133 rodaram como
 * "applied" mas a conta NÃO existe, e o log da plataforma não devolve nada
 * (atrasa ~24h). Aqui a resposta volta na hora, com o erro real se houver.
 *
 * Segurança: só responde com a sessão de quem tem `manage_access`
 * (o mesmo que a tela de Acessos exige). A senha vem do segredo.
 *
 * POST/GET /backend/v1/check/cria-agencia
 */
routerAdd(
  'GET',
  '/backend/v1/check/cria-agencia',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'sem sessao' })

    // quem pede tem manage_access?
    var souAdmin = false
    try {
      for (const g of $app.findRecordsByFilter(
        'access_grants',
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        10,
        0,
      )) {
        var atos = []
        try {
          const rA = g.get('actions')
          atos =
            Array.isArray(rA) && rA.length > 0 && typeof rA[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rA))
              : typeof rA === 'string'
                ? JSON.parse(rA)
                : rA || []
        } catch (eA) {}
        if (Array.isArray(atos) && atos.indexOf('manage_access') >= 0) souAdmin = true
      }
    } catch (e0) {}
    if (!souAdmin) return e.json(403, { ok: false, erro: 'sem manage_access' })

    const app = $app
    const out = { ok: false, passos: [] }
    const EMAIL = 'areah@hsgmarketing.com.br'
    const EMPRESA = '466e6h3zvebl0rf'
    const ACOES = [
      'read_metrics',
      'read_leads',
      'read_conversas',
      'read_reports',
      'read_analyses',
      'read_decisions',
      'read_alerts',
      'manage_criteria',
      'manage_decisions',
      'request_analysis',
    ]

    // ---------- segredo ----------
    var senha = ''
    try {
      senha = String($secrets.get('SENHA_AGENCIA_HSG') || '')
    } catch (eSeg) {}
    out.passos.push({ passo: 'segredo SENHA_AGENCIA_HSG', ok: senha !== '', tamanho: senha.length })
    if (senha === '') {
      out.erro = 'segredo SENHA_AGENCIA_HSG nao cadastrado'
      return e.json(200, out)
    }

    // ---------- a conta ----------
    var u = null
    try {
      const us = app.findRecordsByFilter('users', "email='" + EMAIL + "'", '', 1, 0)
      if (us.length > 0) u = us[0]
    } catch (e1) {
      out.passos.push({ passo: 'procurar conta', ok: false, erro: String(e1).slice(0, 120) })
    }

    if (u) {
      out.passos.push({ passo: 'conta ja existia', ok: true, id: u.id.slice(0, 10) })
      // redefine a senha para garantir o acesso
      try {
        u.setPassword(senha)
        app.save(u)
        out.passos.push({ passo: 'senha redefinida', ok: true })
      } catch (e2) {
        out.passos.push({ passo: 'senha', ok: false, erro: String(e2).slice(0, 140) })
      }
    } else {
      try {
        const colU = app.findCollectionByNameOrId('users')
        u = new Record(colU)
        u.set('email', EMAIL)
        u.set('name', 'Agência HSG')
        u.set('verified', true)
        u.setPassword(senha)
        app.save(u)
        out.passos.push({ passo: 'conta CRIADA', ok: true, id: u.id.slice(0, 10) })
      } catch (e3) {
        out.passos.push({ passo: 'criar conta', ok: false, erro: String(e3).slice(0, 200) })
        out.erro = 'nao criou a conta'
        return e.json(200, out)
      }
    }

    // confirma no banco
    try {
      const conf = app.findRecordById('users', u.id)
      out.passos.push({
        passo: 'conta confirmada no banco',
        ok: String(conf.get('email') || '') === EMAIL,
        email: String(conf.get('email') || ''),
      })
    } catch (e4) {
      out.passos.push({ passo: 'confirmar', ok: false, erro: String(e4).slice(0, 120) })
    }

    // ---------- o grant ----------
    var grant = null
    try {
      const gs = app.findRecordsByFilter(
        'access_grants',
        "user_id='" + u.id + "' && revoked_at=''",
        '',
        1,
        0,
      )
      if (gs.length > 0) grant = gs[0]
    } catch (e5) {}
    if (!grant) {
      try {
        grant = new Record(app.findCollectionByNameOrId('access_grants'))
        grant.set('user_id', u.id)
      } catch (e6) {
        out.passos.push({ passo: 'criar grant', ok: false, erro: String(e6).slice(0, 140) })
        return e.json(200, out)
      }
    }
    try {
      grant.set('role', 'agencia')
      grant.set('actions', JSON.stringify(ACOES))
      grant.set('scope_accounts', JSON.stringify([EMPRESA]))
      grant.set('empresa', EMPRESA)
      grant.set('revoked_at', '')
      app.save(grant)
      out.passos.push({ passo: 'grant salvo', ok: true, acoes: ACOES.length })
    } catch (e7) {
      out.passos.push({ passo: 'salvar grant', ok: false, erro: String(e7).slice(0, 200) })
      return e.json(200, out)
    }

    out.ok = true
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
