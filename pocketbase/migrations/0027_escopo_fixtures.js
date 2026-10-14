/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0027 — fixtures de ESCOPO para o TDD do CA-2-13 (card 5b1de184).
 *
 * - 2 usuários de teste: marketing.a@ / marketing.b@haisan.com.br (senha Fixture@2026).
 * - Grant do A: read_metrics com scope_accounts=['ACC_A'], scope_channels=['meta_ads'].
 * - Grant do B: read_metrics com scope_accounts=['ACC_B'], scope_channels=['meta_ads'].
 * - NENHUMA pessoa real recebe grant aqui (a matriz real é criada pelo dono
 *   autorizado via rotas /acessos/grants, com audit — fora de migração).
 * - Parse de json no JSVM: array de char-codes = string codificada (prova 14/10).
 */
migrate(
  (app) => {
    const colU = app.findCollectionByNameOrId('users')
    const colG = app.findCollectionByNameOrId('access_grants')

    function criaUsuarioFix(email, nome) {
      const existentes = app.findRecordsByFilter(colU, "email='" + email + "'", '', 1, 0)
      if (existentes && existentes.length > 0) return existentes[0]
      const u = new Record(colU)
      u.set('email', email)
      u.set('name', nome)
      u.setPassword('Fixture@2026')
      u.set('verified', true)
      app.save(u)
      console.log('migração 0027: usuário fixture criado: ' + email)
      return app.findRecordsByFilter(colU, "email='" + email + "'", '', 1, 0)[0]
    }

    function grantEscopo(email, role, conta, canal) {
      const us = app.findRecordsByFilter(colU, "email='" + email + "'", '', 1, 0)
      if (!us || us.length === 0) {
        console.log('migração 0027: fixture ' + email + ' não encontrada')
        return
      }
      const uid = us[0].id
      const existentes = app.findRecordsByFilter(
        colG,
        "user_id='" + uid + "' && role='" + role + "'",
        '',
        1,
        0,
      )
      if (existentes && existentes.length > 0) {
        console.log('migração 0027: grant de escopo já existe para ' + email)
        return
      }
      const g = new Record(colG)
      g.set('user_id', uid)
      g.set('role', role)
      g.set('actions', JSON.stringify(['read_metrics']))
      g.set('scope_accounts', JSON.stringify([conta]))
      g.set('scope_channels', JSON.stringify([canal]))
      g.set('approved_at', new Date().toISOString())
      g.set('version', 1)
      g.set('note', 'grant de TESTE de escopo (CA-2-13) — card 5b1de184')
      app.save(g)
      const colA = app.findCollectionByNameOrId('access_audit')
      const a = new Record(colA)
      a.set('at', new Date().toISOString())
      a.set('actor', uid)
      a.set('acao', 'criou_grant_teste_escopo')
      a.set('alvo', email + ' → ' + role + ' [' + conta + '/' + canal + ']')
      a.set(
        'detalhe',
        JSON.stringify({ origem: 'migracao_0027', card: '5b1de184', tipo: 'fixture' }),
      )
      app.save(a)
      console.log('migração 0027: grant de escopo ' + conta + '/' + canal + ' criado p/ ' + email)
    }

    criaUsuarioFix('marketing.a@haisan.com.br', 'Marketing A (fixture)')
    criaUsuarioFix('marketing.b@haisan.com.br', 'Marketing B (fixture)')
    grantEscopo('marketing.a@haisan.com.br', 'marketing', 'ACC_A', 'meta_ads')
    grantEscopo('marketing.b@haisan.com.br', 'marketing', 'ACC_B', 'meta_ads')
  },
  (app) => {
    // reversão: remove grants e usuários fixture de escopo (dados de teste only)
    try {
      const colU = app.findCollectionByNameOrId('users')
      const colG = app.findCollectionByNameOrId('access_grants')
      for (const email of ['marketing.a@haisan.com.br', 'marketing.b@haisan.com.br']) {
        const us = app.findRecordsByFilter(colU, "email='" + email + "'", '', 1, 0)
        if (us && us.length > 0) {
          const gs = app.findRecordsByFilter(colG, "user_id='" + us[0].id + "'", '', 10, 0)
          for (const g of gs) app.delete(g)
          app.delete(us[0])
        }
      }
    } catch (e) {}
    console.log('migração 0027 revertida')
  },
)
