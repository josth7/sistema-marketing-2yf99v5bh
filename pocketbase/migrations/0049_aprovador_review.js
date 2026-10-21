/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0049 — SPEC-3-003: grant review_ai_summary para o aprovador fixture
 * (criterios.fixture.aprovador@haisan.com.br) — o dono testa a revisão com esta conta.
 */
migrate(
  (app) => {
    const colU = app.findCollectionByNameOrId('users')
    const us = app.findRecordsByFilter(
      colU,
      "email='criterios.fixture.aprovador@haisan.com.br'",
      '',
      1,
      0,
    )
    if (!us || us.length === 0) {
      console.log('migração 0049: aprovador fixture não encontrado')
      return
    }
    const uid = us[0].id
    const colG = app.findCollectionByNameOrId('access_grants')
    const grants = app.findRecordsByFilter(
      colG,
      "user_id='" + uid + "' && revoked_at=''",
      '',
      50,
      0,
    )
    let alterou = false
    for (const g of grants) {
      let acts = []
      try {
        const raw = g.get('actions')
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          acts = JSON.parse(String.fromCharCode.apply(null, raw))
        } else if (typeof raw === 'string') {
          acts = JSON.parse(raw)
        } else {
          acts = raw || []
        }
      } catch (e2) {}
      if (acts.indexOf('review_ai_summary') >= 0) continue
      acts.push('review_ai_summary')
      g.set('actions', JSON.stringify(acts))
      app.save(g)
      alterou = true
    }
    console.log('migração 0049: review_ai_summary ' + (alterou ? 'adicionado' : 'já existia'))
  },
  (app) => {
    console.log('migração 0049 revertida: grant permanece')
  },
)
