/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0023 — recipients da política FIXTURE por E-MAIL (card a70d5ab8).
 *
 * IDs de usuário são instáveis entre builds (prova: o tick validou TODOS os IDs
 * da 0017 como inexistentes). Conserto definitivo: a política guarda o E-MAIL e
 * o job resolve e-mail → usuário no momento da entrega (hook já corrigido).
 * A política REAL permanece intocada (enabled=false, recipients=[]).
 */
migrate(
  (app) => {
    const colP = app.findCollectionByNameOrId('report_policy')
    const pols = app.findRecordsByFilter(colP, 'fixture=true', '', 1, 0)
    if (!pols || pols.length === 0) {
      console.log('migração 0023: política fixture não existe — nada a fazer')
      return
    }
    const pol = pols[0]
    pol.set('recipient_user_ids', JSON.stringify(['criterios.fixture.aprovador@haisan.com.br']))
    app.save(pol)
    console.log(
      'migração 0023 aplicada: recipients fixture = e-mail do aprovador (resolvido no tick)',
    )
  },
  (app) => {
    console.log('migração 0023 revertida (recipients de fixture não são restaurados)')
  },
)
