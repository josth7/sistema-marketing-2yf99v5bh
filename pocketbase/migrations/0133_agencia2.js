/// <reference path="../pb_data/types.d.ts" />
/**
 * 0133 — DIAGNÓSTICO da criação da agência (18/11).
 *
 * A migração 0132 rodou ("applied") mas a conta NÃO existe. Suspeita: o segredo
 * `SENHA_AGENCIA_HSG` não estava disponível quando ela rodou, e a migração
 * saiu em silêncio (era o desenho: sem segredo, não faz nada).
 *
 * Este passo LÊ o segredo e TENTA criar de novo, imprimindo o resultado real.
 * A senha continua fora do repositório.
 */
migrate(
  (app) => {
    var senha = ''
    var temSegredo = false
    try {
      senha = String($secrets.get('SENHA_AGENCIA_HSG') || '')
      temSegredo = senha !== ''
    } catch (e1) {}

    console.log('0133: segredo existe = ' + temSegredo + ' (tamanho ' + senha.length + ')')
    if (!temSegredo) {
      console.log('0133: SEM SEGREDO — a conta nao pode ser criada')
      return
    }

    const EMAIL = 'areah@hsgmarketing.com.br'

    // a conta já existe?
    var u = null
    try {
      const us = app.findRecordsByFilter('users', "email='" + EMAIL + "'", '', 1, 0)
      if (us.length > 0) u = us[0]
    } catch (e2) {
      console.log('0133: erro ao procurar -> ' + String(e2).slice(0, 100))
    }

    if (u) {
      console.log(
        '0133: conta JA EXISTE id=' + u.id.slice(0, 10) + ' nome=' + String(u.get('name') || ''),
      )
    } else {
      console.log('0133: conta nao existe — criando')
      try {
        const colU = app.findCollectionByNameOrId('users')
        u = new Record(colU)
        u.set('email', EMAIL)
        u.set('name', 'Agência HSG')
        u.set('verified', true)
        u.setPassword(senha)
        app.save(u)
        console.log('0133: CRIADA id=' + u.id.slice(0, 10))
      } catch (e3) {
        console.log('0133: FALHOU ao criar -> ' + String(e3).slice(0, 200))
        return
      }
    }

    // garante o grant
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
    } catch (e4) {}

    if (!grant) {
      try {
        grant = new Record(app.findCollectionByNameOrId('access_grants'))
        grant.set('user_id', u.id)
      } catch (e5) {
        console.log('0133: falhou o grant -> ' + String(e5).slice(0, 140))
        return
      }
    }
    try {
      grant.set('role', 'agencia')
      grant.set('actions', JSON.stringify(ACOES))
      grant.set('scope_accounts', JSON.stringify(['466e6h3zvebl0rf']))
      grant.set('empresa', '466e6h3zvebl0rf')
      grant.set('revoked_at', '')
      app.save(grant)
      console.log('0133: GRANT salvo (' + ACOES.length + ' acoes, escopo Haisan)')
    } catch (e6) {
      console.log('0133: FALHOU o grant -> ' + String(e6).slice(0, 200))
    }
  },
  (app) => {},
)
