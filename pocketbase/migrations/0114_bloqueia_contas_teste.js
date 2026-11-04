/// <reference path="../pb_data/types.d.ts" />
// ===================================================================
// MIG 0114 — CONTAS DE TESTE COM ACESSO A DADOS REAIS (04/11).
//
// ACHADO, provado por login:
//   criterios.fixture.aprovador@haisan.com.br  loga com Fixture@2026
//   marketing.a@haisan.com.br                 loga com Fixture@2026
//
// A senha `Fixture@2026` está escrita nos documentos de entrega do projeto —
// ou seja, é pública para quem tem acesso ao repositório. E essas contas têm
// papéis de verdade (management/marketing), com 3 a 11 módulos liberados.
//
// O problema é o ESCOPO: as rotas filtram por `fixture` (usuário fixture vê
// dado fixture), então em teoria elas não leem cliente real. Mas:
//   1. bastam UMA rota sem esse filtro para vazar;
//   2. conta parada com senha conhecida é superfície de ataque desnecessária;
//   3. a lista de usuários mostrou 6 contas de teste num sistema em produção.
//
// O QUE ESTA MIGRAÇÃO FAZ (sem apagar nada, sem quebrar QA):
//   - marca `verified=false` e troca a senha por uma ALEATÓRIA nos usuários
//     cujo e-mail contém `fixture` (ou nome contém FIXTURE)
//   - revoga os grants dessas contas (revoked_at preenchido)
//   - o QA recria a senha quando precisar, pelo painel — o histórico fica
//
// NÃO mexe em usuário real (josth, anezia, vendedores, haisan.ecmm, rodrigo).
// ===================================================================
migrate(
  (app) => {
    const colU = app.findCollectionByNameOrId('users')
    const colG = app.findCollectionByNameOrId('access_grants')

    var us = []
    try {
      us = app.findRecordsByFilter(colU, '', '', 300, 0)
    } catch (e0) {
      console.log('0114: nao consegui listar usuarios: ' + e0)
      return
    }

    var bloqueados = 0
    var revogados = 0
    for (const u of us) {
      const email = String(u.get('email') || '').toLowerCase()
      const nome = String(u.get('name') || '').toLowerCase()
      const ehFixture = email.indexOf('fixture') >= 0 || nome.indexOf('fixture') >= 0
      if (!ehFixture) continue

      // 1. senha aleatoria (impede o login com a senha publica)
      try {
        const rnd = 'Fx-' + Math.random().toString(36).slice(2) + new Date().getTime().toString(36)
        const rec = app.findRecordById(colU, u.id)
        rec.setPassword(rnd)
        rec.set('verified', false)
        app.save(rec)
        bloqueados++
      } catch (e1) {
        console.log('0114: falha ao trocar senha de ' + email + ': ' + String(e1).slice(0, 120))
      }

      // 2. revoga grants ativos
      try {
        const gs = app.findRecordsByFilter(
          colG,
          "user_id='" + u.id + "' && revoked_at=''",
          '',
          50,
          0,
        )
        for (const g of gs) {
          g.set('revoked_at', new Date().toISOString())
          g.set(
            'revoked_reason',
            'conta de teste desativada em 04/11 (senha publica em documentacao)',
          )
          app.save(g)
          revogados++
        }
      } catch (e2) {}
    }
    console.log(
      '0114 RESULTADO: ' +
        bloqueados +
        ' conta(s) de teste sem senha valida, ' +
        revogados +
        ' grant(s) revogado(s)',
    )
  },
  (app) => {
    // sem rollback: reativar conta de teste com senha publica e regressao
    console.log('0114 rollback: mantido desativado de proposito')
  },
)
