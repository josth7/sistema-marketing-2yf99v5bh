/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0013 — usuários de TESTE para as provas do card fc6d0f5a (SPEC-2-002).
 *
 * CA-2-05 exige prova com usuário de teste e corpo inválido rejeitado. Dois
 * usuários fixture (claramente marcados, removidos no down):
 * - criterios.fixture.criador@haisan.com.br  — cria rascunhos (NÃO aprova a si mesmo)
 * - criterios.fixture.aprovador@haisan.com.br — aprova rascunhos do criador
 * Não são contas reais da Haisan; nenhuma permissão além de autenticado.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('_pb_users_auth_')
    const fixtures = [
      { email: 'criterios.fixture.criador@haisan.com.br', nome: 'FIXTURE criador (teste)' },
      { email: 'criterios.fixture.aprovador@haisan.com.br', nome: 'FIXTURE aprovador (teste)' },
    ]
    for (const f of fixtures) {
      try {
        app.findAuthRecordByEmail('_pb_users_auth_', f.email)
        continue // já existe — idempotente
      } catch (_) {}
      const rec = new Record(users)
      rec.setEmail(f.email)
      rec.setPassword('Fixture@2026')
      rec.setVerified(true)
      rec.set('name', f.nome)
      app.save(rec)
    }
    console.log('migração 0013 aplicada: 2 usuários fixture de critérios')
  },
  (app) => {
    for (const email of [
      'criterios.fixture.criador@haisan.com.br',
      'criterios.fixture.aprovador@haisan.com.br',
    ]) {
      try {
        const u = app.findAuthRecordByEmail('_pb_users_auth_', email)
        if (u) app.delete(u)
      } catch (_) {}
    }
    console.log('migração 0013 revertida: usuários fixture removidos')
  },
)
