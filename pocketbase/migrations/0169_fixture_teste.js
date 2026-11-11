/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0169 — usuário fixture da empresa TESTE (11/11) — CA-3-91.
 *
 * O card pede "usuários fixture das duas empresas" e a varredura pelas rotas.
 * Só existe usuário da Haisan.
 *
 * **Esta migração cria** um usuário `fixture.teste@haisan.com.br` com grant na
 * empresa **TESTE** (não na Haisan). Com ele dá para provar, pelas rotas, que
 * quem é da TESTE **não vê** nada da Haisan.
 *
 * **Por que migração:** não existe rota de criar usuário de auth — é a lição de
 * 29/10 (senha por `setPassword`, nunca `set('password')`).
 *
 * **Não cria conexão de WhatsApp:** não há número disponível, e o isolamento de
 * LEADS já prova a regra. A conexão só seria necessária para rotas de conversa.
 */
migrate(
  (app) => {
    // empresa TESTE
    var idTeste = ''
    try {
      const es = app.findRecordsByFilter('empresas', "apelido='TESTE'", '', 1, 0)
      if (es.length > 0) idTeste = es[0].id
    } catch (e0) {}
    if (idTeste === '') {
      console.log('0169: empresa TESTE nao existe — abortando')
      return
    }

    // usuário
    const email = 'fixture.teste@haisan.com.br'
    var u = null
    try {
      const us = app.findRecordsByFilter('users', "email='" + email + "'", '', 1, 0)
      if (us.length > 0) u = us[0]
    } catch (e1) {}

    if (!u) {
      try {
        const colU = app.findCollectionByNameOrId('users')
        const novo = new Record(colU)
        novo.set('email', email)
        novo.set('emailVisibility', true)
        novo.set('name', 'FIXTURE TESTE (isolamento)')
        novo.set('verified', true)
        // LIÇÃO 29/10: senha em migração é setPassword, NUNCA set('password')
        novo.setPassword('Fixture@2026')
        app.save(novo)
        u = novo
        console.log('0169: usuario fixture.teste criado')
      } catch (e2) {
        console.log('0169: falhou criar usuario -> ' + String(e2).slice(0, 150))
        return
      }
    }

    // grant na empresa TESTE (só leitura de leads e conversas)
    try {
      const colG = app.findCollectionByNameOrId('access_grants')
      const ja = app.findRecordsByFilter(colG, "user_id='" + u.id + "' && revoked_at=''", '', 1, 0)
      if (!ja || ja.length === 0) {
        const g = new Record(colG)
        g.set('user_id', u.id)
        g.set('role', 'vendedor')
        g.set('actions', JSON.stringify(['read_leads', 'read_conversas']))
        g.set('scope_accounts', JSON.stringify([]))
        g.set('scope_channels', JSON.stringify([]))
        g.set('empresa', idTeste) // ← a empresa dele é a TESTE
        g.set('valid_from', '')
        g.set('valid_until', '')
        g.set('approved_by', '')
        g.set('approved_at', new Date().toISOString())
        g.set('version', 1)
        g.set('revoked_at', '')
        g.set('note', 'fixture de isolamento CA-3-91')
        app.save(g)
        console.log('0169: grant na empresa TESTE criado')
      } else {
        console.log('0169: grant ja existia')
      }
    } catch (e3) {
      console.log('0169: falhou grant -> ' + String(e3).slice(0, 150))
    }

    console.log('0169: pronto (usuario=' + u.id + ', empresa=' + idTeste + ')')
  },
  (app) => {
    console.log('0169 revertida (usuario permanece)')
  },
)
