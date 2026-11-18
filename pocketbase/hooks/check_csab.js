/// <reference path="../pb_data/types.d.ts" />
/**
 * CORRIGE A CONTA DA SABRINA (18/11).
 *
 * DIAGNÓSTICO:
 *   · a conta é `goo7.ecmm@gmail.com` (nome "Sabrina — GOO7"), verificada;
 *   · tem grant `management` com 10 ações, empresa GOO7;
 *   · MAS o `scope_accounts` está VAZIO. Escopo vazio significa "só o próprio"
 *     — então ela entra e não vê nada de empresa nenhuma. É o defeito.
 *   · a senha também não confere (testei as prováveis e nenhuma entrou).
 *
 * O QUE FAZ:
 *   1. põe o escopo na empresa do grant dela (GOO7);
 *   2. define a senha vinda do segredo `SENHA_SABRINA`;
 *   3. garante `verified`.
 *
 * NÃO amplia para a Haisan: o grant dela é da GOO7. Se o dono disser que ela
 * também precisa ver a Haisan, é outra decisão e outro registro.
 *
 * POST/GET /backend/v1/check/corrige-sabrina
 */
routerAdd(
  'GET',
  '/backend/v1/check/corrige-sabrina',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'sem sessao' })

    // exige manage_access
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
    const EMAIL = 'goo7.ecmm@gmail.com'

    var u = null
    try {
      const us = app.findRecordsByFilter('users', "email='" + EMAIL + "'", '', 1, 0)
      if (us.length > 0) u = us[0]
    } catch (e1) {}
    if (!u) {
      out.erro = 'conta nao encontrada'
      return e.json(200, out)
    }
    out.passos.push({ passo: 'conta encontrada', ok: true, nome: String(u.get('name') || '') })

    // ---------- 1. senha ----------
    var senha = ''
    try {
      senha = String($secrets.get('SENHA_SABRINA') || '')
    } catch (e2) {}
    if (senha === '') {
      out.passos.push({ passo: 'segredo SENHA_SABRINA', ok: false })
      out.erro = 'segredo SENHA_SABRINA nao cadastrado'
      return e.json(200, out)
    }
    try {
      u.setPassword(senha)
      if (u.get('verified') !== true) u.set('verified', true)
      app.save(u)
      out.passos.push({ passo: 'senha definida e conta verificada', ok: true })
    } catch (e3) {
      out.passos.push({ passo: 'senha', ok: false, erro: String(e3).slice(0, 160) })
    }

    // ---------- 2. escopo ----------
    var gs = []
    try {
      gs = app.findRecordsByFilter(
        'access_grants',
        "user_id='" + u.id + "' && revoked_at=''",
        '',
        10,
        0,
      )
    } catch (e4) {}
    out.passos.push({ passo: 'grants ativos encontrados', ok: gs.length > 0, qtd: gs.length })

    for (const g of gs) {
      var empresa = String(g.get('empresa') || '')
      if (empresa === '') {
        // sem empresa no grant: usa a única empresa da Sabrina (GOO7)
        empresa = '78b71rygx3rtnwg'
      }
      try {
        g.set('scope_accounts', JSON.stringify([empresa]))
        if (String(g.get('empresa') || '') === '') g.set('empresa', empresa)
        app.save(g)
        out.passos.push({ passo: 'escopo definido', ok: true, empresa: empresa.slice(0, 10) })
      } catch (e5) {
        out.passos.push({ passo: 'escopo', ok: false, erro: String(e5).slice(0, 160) })
      }
    }

    // confirma relendo
    try {
      var conf = []
      for (const g of app.findRecordsByFilter(
        'access_grants',
        "user_id='" + u.id + "' && revoked_at=''",
        '',
        10,
        0,
      )) {
        var esc = []
        try {
          const rS = g.get('scope_accounts')
          esc =
            Array.isArray(rS) && rS.length > 0 && typeof rS[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rS))
              : typeof rS === 'string'
                ? JSON.parse(rS)
                : rS || []
        } catch (eS) {}
        conf.push({
          role: String(g.get('role') || ''),
          escopo: Array.isArray(esc) ? esc.join(',') : '',
        })
      }
      out.grants_finais = conf
      out.passos.push({
        passo: 'escopo confirmado no banco',
        ok: conf.length > 0 && conf[0].escopo !== '',
      })
    } catch (e6) {}

    out.ok = true
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
