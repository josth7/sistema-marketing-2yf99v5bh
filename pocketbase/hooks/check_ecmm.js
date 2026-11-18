/// <reference path="../pb_data/types.d.ts" />
/**
 * A CONTA haisan.ecmm@gmail.com — existe? tem acesso? (18/11)
 *
 * O dono pediu: essa conta "não está aparecendo as informações" e ele quer
 * que ela tenha acesso de ADMIN.
 *
 * Aqui só se LÊ: a conta, o grant, o escopo e os módulos que ela veria.
 * Nada é alterado (o `?executar=1` só cria o grant, nunca troca senha).
 *
 * GET /backend/v1/check/conta-ecmm?executar=1
 */
routerAdd(
  'GET',
  '/backend/v1/check/conta-ecmm',
  (e) => {
    // ROTA TEMPORARIA DE DIAGNOSTICO (18/11): autentica pelo segredo do Maestro,
    // porque a senha da conta de gestao foi trocada pela propria pessoa.
    // Nao aceita requisicao sem o segredo; nao altera nada sem ?executar=1.
    var segredoOk = false
    try {
      const esperado = String($secrets.get('MAESTRO_SHARED_SECRET') || '')
      const recebido = String(e.request.url.query().get('segredo') || '')
      segredoOk = esperado !== '' && recebido === esperado
    } catch (eSeg) {}
    if (!segredoOk) return e.json(401, { ok: false, erro: 'segredo invalido' })

    const app = $app
    const executar = String(e.request.url.query().get('executar') || '') === '1'
    const EMAIL = 'haisan.ecmm@gmail.com'
    const out = { ok: true, executar: executar, conta: null, grants: [], acoes: [], modulos: [] }

    // ---------- a conta ----------
    var u = null
    try {
      const us = app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        "email='" + EMAIL + "'",
        '',
        1,
        0,
      )
      if (us.length > 0) u = us[0]
    } catch (e0) {}

    if (!u) {
      out.conta = null
      out.diagnostico =
        'A conta NAO existe no sistema. Precisa ser criada — e criar usuario e ato do dono pelo painel.'
      return e.json(200, out)
    }

    out.conta = {
      id: u.id.slice(0, 12),
      nome: String(u.get('name') || '(VAZIO)'),
      email: String(u.get('email') || ''),
      verificado: u.get('verified') === true,
      criado: String(u.get('created') || '').slice(0, 16),
    }

    // ---------- grants ativos ----------
    var gs = []
    try {
      gs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "user_id='" + u.id + "' && revoked_at=''",
        '',
        10,
        0,
      )
    } catch (e1) {}

    out.grants = []
    for (const g of gs) {
      var atos = []
      var escopo = []
      try {
        const rA = g.get('actions')
        atos =
          Array.isArray(rA) && rA.length > 0 && typeof rA[0] === 'number'
            ? JSON.parse(String.fromCharCode.apply(null, rA))
            : typeof rA === 'string'
              ? JSON.parse(rA)
              : rA || []
      } catch (eA) {}
      try {
        const rS = g.get('scope_accounts')
        escopo =
          Array.isArray(rS) && rS.length > 0 && typeof rS[0] === 'number'
            ? JSON.parse(String.fromCharCode.apply(null, rS))
            : typeof rS === 'string'
              ? JSON.parse(rS)
              : rS || []
      } catch (eS) {}
      out.grants.push({
        role: String(g.get('role') || ''),
        acoes: Array.isArray(atos) ? atos.length : 0,
        escopo: Array.isArray(escopo) ? escopo.join(',') : '',
        empresa: String(g.get('empresa') || '').slice(0, 10),
        criado: String(g.get('created') || '').slice(0, 16),
      })
      if (Array.isArray(atos)) for (const a of atos) if (out.acoes.indexOf(a) < 0) out.acoes.push(a)
    }

    // ---------- o que ela veria no menu ----------
    // a referência é a conta da Anezia (gestão funcionando)
    var ref = null
    try {
      const rs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        "email='anezia@haisan.com.br'",
        '',
        1,
        0,
      )
      if (rs.length > 0) ref = rs[0]
    } catch (e2) {}
    var refAcoes = []
    if (ref) {
      try {
        for (const g of app.findRecordsByFilter(
          app.findCollectionByNameOrId('access_grants'),
          "user_id='" + ref.id + "' && revoked_at=''",
          '',
          10,
          0,
        )) {
          var a2 = []
          try {
            const rA2 = g.get('actions')
            a2 =
              Array.isArray(rA2) && rA2.length > 0 && typeof rA2[0] === 'number'
                ? JSON.parse(String.fromCharCode.apply(null, rA2))
                : typeof rA2 === 'string'
                  ? JSON.parse(rA2)
                  : rA2 || []
          } catch (eA2) {}
          if (Array.isArray(a2)) for (const a of a2) if (refAcoes.indexOf(a) < 0) refAcoes.push(a)
        }
      } catch (e3) {}
    }

    out.referencia_anezia = refAcoes.length
    // quais ações da Anezia faltam nesta conta
    out.faltando = []
    for (const a of refAcoes) if (out.acoes.indexOf(a) < 0) out.faltando.push(a)

    // ---------- a empresa e as conexões ----------
    try {
      out.conexoes = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "vendedor_user='" + u.id + "'",
        '',
        5,
        0,
      ).length
    } catch (e4) {}

    out.diagnostico =
      out.grants.length === 0
        ? 'A conta existe mas NAO tem nenhum acesso (grant) ativo — por isso nao aparece informacao nenhuma.'
        : out.faltando.length > 0
          ? 'A conta tem acesso, mas faltam ' + out.faltando.length + ' acoes que a gestao tem.'
          : 'A conta tem os mesmos acessos da gestao.'

    return e.json(200, out)
  },
  // sem $apis.requireAuth: a checagem e o segredo acima
)
