/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0037 — grants reais de read_analyses (card 2e44a45f, CA-3-02).
 *
 * A tela /analises exige o grant read_analyses (escopo por grant, SPEC-3-001).
 * Os usuários reais do sistema ainda não tinham essa ação — esta migração cria
 * o grant de LEITURA para as contas reais (a matriz completa de quem pode pedir
 * análise/revisar resumo é decisão do dono — DH-10/DH-11 — e nasce nos cards
 * seguintes). approved_by = o próprio usuário (bootstrap, padrão da 0026).
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    const colG = app.findCollectionByNameOrId('access_grants')
    const emails = ['haisan.ecmm@gmail.com', 'anezia@haisan.com.br', 'josth7@icloud.com']
    for (const email of emails) {
      try {
        const us = app.findRecordsByFilter(users, "email='" + email + "'", '', 1, 0)
        if (!us || us.length === 0) {
          console.log('migração 0037: usuário não encontrado: ' + email)
          continue
        }
        const uid = us[0].id
        const existentes = app.findRecordsByFilter(
          colG,
          "user_id='" +
            uid +
            "' && revoked_at='' && note='fase 3 — leitura de análises (bootstrap)'",
          '',
          1,
          0,
        )
        if (existentes && existentes.length > 0) {
          console.log('migração 0037: grant já existe p/ ' + email)
          continue
        }
        const g = new Record(colG)
        g.set('user_id', uid)
        g.set('role', 'management')
        g.set('actions', JSON.stringify(['read_analyses']))
        g.set('scope_accounts', JSON.stringify([]))
        g.set('scope_channels', JSON.stringify([]))
        g.set('valid_from', '')
        g.set('approved_by', uid)
        g.set('approved_at', new Date().toISOString())
        g.set('version', 1)
        g.set('note', 'fase 3 — leitura de análises (bootstrap)')
        app.save(g)
        console.log('migração 0037: grant read_analyses criado p/ ' + email)
      } catch (e) {
        console.log('migração 0037: ' + email + ': ' + String(e).slice(0, 120))
      }
    }
  },
  (app) => {
    console.log('migração 0037 revertida: grants de leitura permanecem')
  },
)
