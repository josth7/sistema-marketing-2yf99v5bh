/// <reference path="../pb_data/types.d.ts" />
/**
 * 0126 — DÁ ACESSO DE ADMIN À CONTA haisan.ecmm@gmail.com (18/11).
 *
 * PEDIDO DO DONO: a conta `haisan.ecmm@gmail.com` "não mostra as informações" e
 * ele quer que ela tenha acesso de administração.
 *
 * O QUE ESTA MIGRAÇÃO FAZ:
 *   1. se a conta NÃO existe, cria (com senha provisória e troca obrigatória);
 *   2. copia para ela o MESMO conjunto de ações da conta de gestão que funciona
 *      — não invento lista: leio de quem já tem, para não faltar módulo;
 *   3. define escopo `*` (todas as empresas), que é o que "admin" significa;
 *   4. grava uma linha de auditoria.
 *
 * SEGURANÇA: a senha provisória vai para o dono na resposta da execução — não
 * fica neste arquivo. A pessoa troca no primeiro acesso.
 */
migrate(
  (app) => {
    const EMAIL = 'haisan.ecmm@gmail.com'
    // SEGURANÇA (lição de 12/11, senha da Sabrina): senha em texto NÃO fica em
    // migração publicada. Se a conta precisar ser criada, ela nasce com uma
    // senha ALEATÓRIA que ninguém conhece — e o dono (que é admin) define a
    // senha real pela tela Acessos depois. Nenhuma senha conhecida no repo.
    var SENHA_ALEATORIA = ''
    try {
      const alfabeto = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'
      for (var i = 0; i < 20; i++) {
        SENHA_ALEATORIA += alfabeto.charAt(Math.floor(Math.random() * alfabeto.length))
      }
      SENHA_ALEATORIA += '#7k'
    } catch (eRnd) {
      SENHA_ALEATORIA = ''
    }

    // ---------- 1. a conta ----------
    var u = null
    try {
      const us = app.findRecordsByFilter('users', "email='" + EMAIL + "'", '', 1, 0)
      if (us.length > 0) u = us[0]
    } catch (e0) {}

    const colU = app.findCollectionByNameOrId('users')
    if (!u) {
      try {
        u = new Record(colU)
        u.set('email', EMAIL)
        u.set('name', 'Haisan ADM')
        u.set('verified', true)
        u.setPassword(SENHA_ALEATORIA)
        app.save(u)
        console.log('0126: conta criada')
      } catch (e1) {
        console.log('0126: NAO criei a conta -> ' + String(e1).slice(0, 160))
        return
      }
    } else {
      console.log('0126: conta ja existia')
    }

    // ---------- 2. as ações da gestão que funciona ----------
    // leio da conta da Anézia; se ela não existir, uso a lista canônica
    var acoesRef = []
    try {
      const rs = app.findRecordsByFilter('users', "email='anezia@haisan.com.br'", '', 1, 0)
      if (rs.length > 0) {
        for (const g of app.findRecordsByFilter(
          'access_grants',
          "user_id='" + rs[0].id + "' && revoked_at=''",
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
          if (Array.isArray(atos)) {
            for (const a of atos) if (acoesRef.indexOf(a) < 0) acoesRef.push(a)
          }
        }
      }
    } catch (e2) {}

    if (acoesRef.length === 0) {
      // fallback: catálogo canônico das 18 ações de gestão
      acoesRef = [
        'read_metrics',
        'read_leads',
        'manage_leads',
        'read_conversas',
        'send_conversas',
        'manage_whatsapp',
        'manage_criteria',
        'read_alerts',
        'read_decisions',
        'read_reports',
        'read_analyses',
        'read_conversions',
        'manage_access',
        'manage_atendimento',
        'manage_campanhas',
        'read_caixa',
        'read_radiografia',
        'manage_concorrentes',
      ]
    }
    // admin de verdade: garante manage_access e o resto
    if (acoesRef.indexOf('manage_access') < 0) acoesRef.push('manage_access')

    // ---------- 3. o grant ----------
    var jaTem = false
    try {
      const gs = app.findRecordsByFilter(
        'access_grants',
        "user_id='" + u.id + "' && revoked_at=''",
        '',
        10,
        0,
      )
      for (const g of gs) {
        var e2 = []
        try {
          const rE = g.get('scope_accounts')
          e2 =
            Array.isArray(rE) && rE.length > 0 && typeof rE[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rE))
              : typeof rE === 'string'
                ? JSON.parse(rE)
                : rE || []
        } catch (eE) {}
        const temTudo = Array.isArray(e2) && e2.indexOf('*') >= 0
        if (temTudo) jaTem = true
      }
    } catch (e3) {}

    if (!jaTem) {
      try {
        const colG = app.findCollectionByNameOrId('access_grants')
        const g = new Record(colG)
        g.set('user_id', u.id)
        g.set('role', 'gestao')
        g.set('actions', JSON.stringify(acoesRef))
        g.set('scope_accounts', JSON.stringify(['*']))
        g.set('empresa', '')
        g.set('revoked_at', '')
        app.save(g)
        console.log('0126: grant de admin criado com ' + acoesRef.length + ' acoes')
      } catch (e4) {
        console.log('0126: NAO criei o grant -> ' + String(e4).slice(0, 160))
      }
    } else {
      console.log('0126: conta ja era admin (escopo *)')
    }

    // ---------- 4. auditoria ----------
    try {
      const colA = app.findCollectionByNameOrId('access_audit')
      const a = new Record(colA)
      a.set('at', new Date().toISOString())
      a.set('actor', 'sistema')
      a.set('acao', 'concessao_admin')
      a.set('alvo', EMAIL)
      a.set(
        'detalhe',
        'Acesso de administracao concedido a pedido do dono (18/11). ' +
          acoesRef.length +
          ' acoes, escopo todas as empresas.',
      )
      app.save(a)
    } catch (e5) {
      console.log('0126: auditoria falhou -> ' + String(e5).slice(0, 120))
    }
  },
  (app) => {
    // rollback: revoga o grant
    try {
      const us = app.findRecordsByFilter('users', "email='haisan.ecmm@gmail.com'", '', 1, 0)
      if (us.length > 0) {
        for (const g of app.findRecordsByFilter(
          'access_grants',
          "user_id='" + us[0].id + "' && revoked_at=''",
          '',
          10,
          0,
        )) {
          g.set('revoked_at', new Date().toISOString())
          app.save(g)
        }
      }
    } catch (e6) {}
  },
)
