/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0039 — Card CA-3-03: grants fixture para o pedido manual (RN-07).
 * A 0038 rodou na v0.0.170 ANTES do patch dos grants (migração executa uma vez
 * só) — os grants fixture ficaram sem request_analysis. Esta migração:
 * - marketing.a: grant fixture da fase 3 com read_analyses + request_analysis
 *   no escopo ACC_A/meta_ads (prova scope ⊆ grant);
 * - criterios.fixture.aprovador: adiciona read_analyses + request_analysis ao
 *   grant fixture ativo (prova teto 4/4 e dados_parciais).
 * NADA aqui toca usuários reais — a matriz real é decisão do dono (DH-10).
 */
migrate(
  (app) => {
    const colU = app.findCollectionByNameOrId('users')
    const colG = app.findCollectionByNameOrId('access_grants')

    function acoesDe(g) {
      try {
        const raw = g.get('actions')
        return Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number'
          ? JSON.parse(String.fromCharCode.apply(null, raw))
          : typeof raw === 'string'
            ? JSON.parse(raw)
            : raw || []
      } catch (e) {
        return []
      }
    }

    // ---- marketing.a: grant fixture fase 3 com request_analysis ----
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
          const acts = acoesDe(g)
          if (acts.indexOf('request_analysis') < 0) {
            acts.push('request_analysis')
            g.set('actions', JSON.stringify(acts))
            app.save(g)
            console.log('migração 0039: request_analysis no grant fase 3 de marketing.a')
          }
        } else {
          const g = new Record(colG)
          g.set('user_id', uid)
          g.set('role', 'marketing')
          g.set('actions', JSON.stringify(['read_analyses', 'request_analysis']))
          g.set('scope_accounts', JSON.stringify(['ACC_A']))
          g.set('scope_channels', JSON.stringify(['meta_ads']))
          g.set('valid_from', '')
          g.set('approved_at', new Date().toISOString())
          g.set('version', 1)
          g.set('note', 'fixtures fase 3 — canal de análise (0039)')
          app.save(g)
          console.log('migração 0039: grant fixture fase 3 criado p/ marketing.a (ACC_A/meta_ads)')
        }
      }
    } catch (eA) {
      console.log('migração 0039: marketing.a — ' + String(eA).slice(0, 120))
    }

    // ---- aprovador fixture: request_analysis + read_analyses no grant ativo ----
    try {
      const us2 = app.findRecordsByFilter(
        colU,
        "email='criterios.fixture.aprovador@haisan.com.br'",
        '',
        1,
        0,
      )
      if (us2 && us2.length > 0) {
        const uid2 = us2[0].id
        const gs2 = app.findRecordsByFilter(
          colG,
          "user_id='" + uid2 + "' && revoked_at=''",
          '',
          5,
          0,
        )
        let ok = false
        for (const g2 of gs2) {
          const acts2 = acoesDe(g2)
          if (acts2.indexOf('request_analysis') < 0 || acts2.indexOf('read_analyses') < 0) {
            if (acts2.indexOf('request_analysis') < 0) acts2.push('request_analysis')
            if (acts2.indexOf('read_analyses') < 0) acts2.push('read_analyses')
            g2.set('actions', JSON.stringify(acts2))
            app.save(g2)
            ok = true
          }
        }
        if (!ok && gs2.length === 0) {
          const g3 = new Record(colG)
          g3.set('user_id', uid2)
          g3.set('role', 'management')
          g3.set('actions', JSON.stringify(['read_analyses', 'request_analysis']))
          g3.set('scope_accounts', JSON.stringify(['*']))
          g3.set('scope_channels', JSON.stringify(['*']))
          g3.set('valid_from', '')
          g3.set('approved_at', new Date().toISOString())
          g3.set('version', 1)
          g3.set('note', 'fixtures fase 3 — canal de análise (0039)')
          app.save(g3)
          console.log('migração 0039: grant fixture fase 3 criado p/ aprovador fixture')
        } else {
          console.log('migração 0039: aprovador fixture com request_analysis/read_analyses')
        }
      }
    } catch (eB) {
      console.log('migração 0039: aprovador fixture — ' + String(eB).slice(0, 120))
    }
  },
  (app) => {
    console.log('migração 0039 revertida: grants fixture permanecem (rollback não remove dados)')
  },
)
