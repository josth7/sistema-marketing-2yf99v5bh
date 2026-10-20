/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0040 — Card CA-3-03: grant fixture do marketing.a com VERSION nova.
 * A 0039 falhou silencioso no insert: UNIQUE (user_id, role, version) — já
 * existe grant (marketing.a, marketing, v1) revogado da 0027. Aqui: cria com
 * version = max+1 do usuário.
 */
migrate(
  (app) => {
    const colU = app.findCollectionByNameOrId('users')
    const colG = app.findCollectionByNameOrId('access_grants')
    try {
      const us = app.findRecordsByFilter(colU, "email='marketing.a@haisan.com.br'", '', 1, 0)
      if (us && us.length > 0) {
        const uid = us[0].id
        const ex = app.findRecordsByFilter(
          colG,
          "user_id='" + uid + "' && revoked_at='' && note~'fixtures fase 3'",
          '',
          1,
          0,
        )
        if (ex && ex.length > 0) {
          const g = ex[0]
          let acts = []
          try {
            const raw = g.get('actions')
            acts =
              Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number'
                ? JSON.parse(String.fromCharCode.apply(null, raw))
                : typeof raw === 'string'
                  ? JSON.parse(raw)
                  : raw || []
          } catch (e) {}
          if (acts.indexOf('request_analysis') < 0) {
            acts.push('request_analysis')
            g.set('actions', JSON.stringify(acts))
            app.save(g)
            console.log('migração 0040: request_analysis no grant fase 3 de marketing.a')
          }
        } else {
          const todos = app.findRecordsByFilter(colG, "user_id='" + uid + "'", '-version', 20, 0)
          let maxV = 0
          for (const t of todos) {
            const v = Number(t.get('version') || 0)
            if (v > maxV) maxV = v
          }
          const g = new Record(colG)
          g.set('user_id', uid)
          g.set('role', 'marketing')
          g.set('actions', JSON.stringify(['read_analyses', 'request_analysis']))
          g.set('scope_accounts', JSON.stringify(['ACC_A']))
          g.set('scope_channels', JSON.stringify(['meta_ads']))
          g.set('valid_from', '')
          g.set('approved_at', new Date().toISOString())
          g.set('version', maxV + 1)
          g.set('note', 'fixtures fase 3 — canal de análise (0040)')
          app.save(g)
          console.log(
            'migração 0040: grant fixture fase 3 criado p/ marketing.a (v' +
              (maxV + 1) +
              ', ACC_A/meta_ads)',
          )
        }
      }
    } catch (eA) {
      console.log('migração 0040: marketing.a — ' + String(eA).slice(0, 160))
    }
  },
  (app) => {
    console.log('migração 0040 revertida: grants fixture permanecem (rollback não remove dados)')
  },
)
