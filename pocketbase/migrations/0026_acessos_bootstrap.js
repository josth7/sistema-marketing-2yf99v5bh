/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0026 — grant de teste com manage_access para o aprovador fixture
 * (SPEC-2-005, card f9a2a3eb). Fixture ISOLADA (DECISÃO DO CLIENTE 14/10):
 * sem ela ninguém no sistema pode gerenciar acessos e o card 5b1de184 não tem
 * como ser testado. Revogável; nenhuma pessoa real.
 * Parse de json no JSVM: array de char-codes = string codificada (prova /me 14/10).
 */
migrate(
  (app) => {
    const colU = app.findCollectionByNameOrId('users')
    const colG = app.findCollectionByNameOrId('access_grants')
    const us = app.findRecordsByFilter(
      colU,
      "email='criterios.fixture.aprovador@haisan.com.br'",
      '',
      1,
      0,
    )
    if (!us || us.length === 0) {
      console.log('migração 0026: aprovador fixture não encontrado — nada a fazer')
      return
    }
    const uid = us[0].id
    const existentes = app.findRecordsByFilter(
      colG,
      "user_id='" + uid + "' && role='management'",
      '',
      10,
      0,
    )
    for (const g of existentes) {
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
      } catch (e) {
        acts = []
      }
      if (acts.indexOf('manage_access') >= 0) {
        console.log('migração 0026: grant já tem manage_access — nada a fazer')
        return
      }
      acts.push('manage_access')
      g.set('actions', JSON.stringify(acts))
      app.save(g)
      const colA = app.findCollectionByNameOrId('access_audit')
      const a = new Record(colA)
      a.set('at', new Date().toISOString())
      a.set('actor', uid)
      a.set('acao', 'ampliou_grant_teste')
      a.set('alvo', 'criterios.fixture.aprovador@haisan.com.br → management v' + g.get('version'))
      a.set(
        'detalhe',
        JSON.stringify({ origem: 'migracao_0026', card: 'f9a2a3eb', adicionou: 'manage_access' }),
      )
      app.save(a)
      console.log('migração 0026: manage_access adicionado ao grant de teste do aprovador')
      return
    }
    console.log('migração 0026: sem grant de teste do aprovador — nada a fazer')
  },
  (app) => {
    console.log('migração 0026 revertida (manage_access de fixture não é removido aqui)')
  },
)
