/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0115 — massa de prova para a suspensão (04/11).
 *
 * Cria uma pessoa DESCARTÁVEL (aparece como conta de teste: e-mail e nome com
 * "fixture") com acesso de vendedor, mais 5 leads pendentes na carteira dela.
 * Serve só para provar que, ao suspender, os leads voltam para o rodízio.
 *
 * Como é descartável, ela também não entra no rodízio de verdade: o filtro de
 * "fixture" que já existe nas rotas de distribuição a ignora.
 *
 * Idempotente: se a pessoa já existe, só reusa.
 */
migrate(
  (app) => {
    const colU = app.findCollectionByNameOrId('users')
    const colG = app.findCollectionByNameOrId('access_grants')
    const colL = app.findCollectionByNameOrId('crm_leads')

    const EMAIL = 'suspensao.fixture@haisan.com.br'
    const NOME = 'Fixture Suspensao (teste)'
    const SENHA = 'Fixture@2026'

    // ---------- pessoa ----------
    var pessoa = null
    try {
      const achou = app.findRecordsByFilter(colU, "email='" + EMAIL + "'", '', 1, 0)
      if (achou && achou.length > 0) pessoa = achou[0]
    } catch (e0) {}

    if (!pessoa) {
      try {
        const u = new Record(colU)
        u.set('email', EMAIL)
        u.set('name', NOME)
        u.set('verified', true)
        u.setPassword(SENHA)
        app.save(u)
        pessoa = u
        console.log('0115: pessoa de prova criada (' + u.id + ')')
      } catch (e1) {
        console.log('0115: falhou criar pessoa -> ' + String(e1).slice(0, 200))
        return
      }
    } else {
      try {
        pessoa.setPassword(SENHA)
        app.save(pessoa)
        console.log('0115: pessoa de prova ja existia (' + pessoa.id + ')')
      } catch (e2) {}
    }

    // ---------- grant de vendedor ----------
    try {
      const gs = app.findRecordsByFilter(
        colG,
        "user_id='" + pessoa.id + "' && revoked_at=''",
        '',
        5,
        0,
      )
      if (!gs || gs.length === 0) {
        const g = new Record(colG)
        g.set('user_id', pessoa.id)
        g.set('role', 'vendedor')
        g.set('actions', JSON.stringify(['read_leads', 'read_conversas']))
        g.set('scope_accounts', JSON.stringify([]))
        g.set('scope_channels', JSON.stringify([]))
        g.set('valid_from', '')
        g.set('valid_until', '')
        g.set('revoked_at', '')
        g.set('version', 1)
        g.set('note', 'massa de prova da suspensao (0115)')
        app.save(g)
        console.log('0115: grant de vendedor criado')
      }
    } catch (e3) {
      console.log('0115: falhou grant -> ' + String(e3).slice(0, 200))
    }

    // ---------- 5 leads pendentes na carteira dela ----------
    var criados = 0
    for (var i = 1; i <= 5; i++) {
      const tel = '554190000' + (1000 + i)
      var existe = null
      try {
        const a = app.findRecordsByFilter(colL, "telefone='" + tel + "'", '', 1, 0)
        if (a && a.length > 0) existe = a[0]
      } catch (e4) {}
      if (existe) continue
      try {
        const l = new Record(colL)
        l.set('nome', 'Prova Suspensao ' + i)
        l.set('telefone', tel)
        l.set('status', 'entrada_lead')
        l.set('owner_id', pessoa.id)
        l.set('vendedor_nome', NOME)
        l.set('fixture', true)
        l.set('origem', 'manual')
        app.save(l)
        criados++
      } catch (e5) {
        console.log('0115: lead ' + i + ' falhou -> ' + String(e5).slice(0, 160))
      }
    }
    console.log('0115: leads de prova criados=' + criados + ' | pessoa=' + pessoa.id)
  },
  (app) => {
    // a limpeza é feita pela 0117 depois da prova
    console.log('0115 revertida: nada removido')
  },
)
