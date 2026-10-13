/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0020 — corrige recipients da política FIXTURE (card a70d5ab8).
 *
 * O tick revelou recipient_user_ids com IDs mortos (91, 34, 101… — restos de
 * execuções antigas): o job validou TODOS como inexistentes e ninguém recebeu
 * ("0 entrega(s) na caixa"). Correção: recipients = [ID ATUAL do aprovador fixture].
 * A política REAL permanece intocada (enabled=false, recipients=[]).
 */
migrate(
  (app) => {
    const colP = app.findCollectionByNameOrId('report_policy')
    const pols = app.findRecordsByFilter(colP, 'fixture=true', '', 1, 0)
    if (!pols || pols.length === 0) {
      console.log('migração 0020: política fixture não existe — nada a fazer')
      return
    }
    const pol = pols[0]
    let aprovadorId = null
    try {
      const colU = app.findCollectionByNameOrId('users')
      const users = app.findRecordsByFilter(
        colU,
        "email='criterios.fixture.aprovador@haisan.com.br'",
        '',
        1,
        0,
      )
      if (users && users.length > 0) aprovadorId = users[0].id
    } catch (e) {
      console.log('migração 0020: aprovador não encontrado: ' + String(e).slice(0, 120))
    }
    if (aprovadorId) {
      pol.set('recipient_user_ids', JSON.stringify([aprovadorId]))
      pol.set('approved_by', aprovadorId)
      app.save(pol)
      console.log('migração 0020 aplicada: recipients da política fixture = aprovador atual')
    } else {
      console.log('migração 0020: SEM aprovador — recipients mantidos (verificar usuários fixture)')
    }
  },
  (app) => {
    console.log(
      'migração 0020 revertida (recipients de fixture não são restaurados — correção de dados)',
    )
  },
)
