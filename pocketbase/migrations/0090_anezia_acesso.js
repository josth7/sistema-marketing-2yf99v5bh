/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0090 — Anezia entra no sistema (30/10).
 *
 * Passo 2 da ordem do dono: a Anezia (gerente comercial) precisa conferir o CRM
 * com um caso real. Para isso ela precisa de login — hoje ela não tem.
 *
 * Diferença em relação aos vendedores (0082/0086/0087/0088): o vendedor vê
 * SÓ a carteira dele (escopo próprio, RN-87). A Anezia é gerente comercial:
 * ela vê TUDO — leads de todos, conversas de todos os números — porque o
 * trabalho dela é justamente analisar as negociações do time.
 *
 * Escopo `['*']` = tudo (o código trata vazio como "só o meu" e '*' como tudo).
 *
 * Sem número de WhatsApp: ela não é vendedora, não tem conexão D-API. Ela usa o
 * sistema pela tela (leads, conversas, painel).
 *
 * Idempotente.
 */

migrate(
  (app) => {
    const colU = app.findCollectionByNameOrId('users')
    const colG = app.findCollectionByNameOrId('access_grants')

    const EMAIL = 'anezia@haisan.com.br'
    const SENHA = 'Haisan@2026'
    const NOME = 'Anezia Dziedzic (Gerente Comercial)'

    // Ações de quem manda no comercial: lê e mexe em lead, lê as conversas de
    // todos os números para analisar negociação, e vê painel/relatórios/alertas.
    const ACOES = [
      'read_leads',
      'write_leads',
      'manage_leads',
      'read_conversas',
      'manage_atendimento',
      'read_metrics',
      'read_reports',
      'read_alerts',
      'manage_alerts',
      'read_decisions',
      'manage_decisions',
      'request_analysis',
      'read_analyses',
      'review_ai_summary',
    ]

    // ---------- 1. usuário ----------
    var anezia = null
    var existentes = []
    try {
      existentes = app.findRecordsByFilter(colU, "email='" + EMAIL + "'", '', 1, 0)
    } catch (e0) {}
    if (existentes && existentes.length > 0) {
      anezia = existentes[0]
      console.log('0090: usuário da Anezia já existia')
    } else {
      anezia = new Record(colU)
      anezia.set('email', EMAIL)
      anezia.set('password', SENHA)
      anezia.set('passwordConfirm', SENHA)
      anezia.set('name', NOME)
      anezia.set('verified', true)
      try {
        app.save(anezia)
        console.log('0090: usuário da Anezia criado')
      } catch (e1) {
        console.log('0090: falhou criar usuário -> ' + String(e1).slice(0, 200))
        return
      }
    }

    // ---------- 2. grant (escopo TOTAL) ----------
    var grants = []
    try {
      grants = app.findRecordsByFilter(
        colG,
        "user_id='" + anezia.id + "' && revoked_at=''",
        '-created',
        5,
        0,
      )
    } catch (e2) {}

    if (!grants || grants.length === 0) {
      const g = new Record(colG)
      g.set('user_id', anezia.id)
      g.set('role', 'management')
      g.set('version', 1)
      g.set('actions', ACOES)
      // '*' = vê tudo. Vazio aqui seria "só o próprio" e ela não veria nada.
      g.set('scope_accounts', ['*'])
      g.set('scope_channels', ['*'])
      g.set('valid_from', '')
      g.set('valid_until', '')
      g.set('revoked_at', '')
      try {
        app.save(g)
        console.log('0090: grant da Anezia criado (escopo total)')
      } catch (e3) {
        console.log('0090: falhou grant -> ' + String(e3).slice(0, 200))
      }
    } else {
      console.log('0090: grant da Anezia já existia')
      const g = grants[0]
      // soma as ações sem tirar o que já havia (lição 0070: liberação é por OR)
      var acts = []
      try {
        const raw = g.get('actions')
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          acts = JSON.parse(String.fromCharCode.apply(null, raw))
        } else if (typeof raw === 'string') {
          acts = JSON.parse(raw)
        } else {
          acts = raw || []
        }
      } catch (e4) {}
      if (!Array.isArray(acts)) acts = []
      var mudou = false
      for (const a of ACOES) {
        if (acts.indexOf(a) < 0) {
          acts.push(a)
          mudou = true
        }
      }
      if (mudou) {
        g.set('actions', acts)
        try {
          app.save(g)
          console.log('0090: ações somadas ao grant da Anezia')
        } catch (e5) {}
      }
      // garante escopo total
      try {
        const sc = g.get('scope_accounts')
        var lista = []
        if (Array.isArray(sc) && sc.length > 0 && typeof sc[0] === 'number') {
          lista = JSON.parse(String.fromCharCode.apply(null, sc))
        } else if (typeof sc === 'string' && sc !== '') {
          lista = JSON.parse(sc)
        } else if (Array.isArray(sc)) {
          lista = sc
        }
        if (lista.indexOf('*') < 0) {
          g.set('scope_accounts', ['*'])
          g.set('scope_channels', ['*'])
          app.save(g)
          console.log('0090: escopo da Anezia ampliado para total')
        }
      } catch (e6) {}
    }

    console.log('0090: Anezia pronta — ' + EMAIL)
  },
  (app) => {
    console.log('0090 revertida (usuário e grant preservados para auditoria)')
  },
)
