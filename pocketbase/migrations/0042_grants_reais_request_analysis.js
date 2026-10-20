/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0042 — request_analysis nos grants REAIS (complemento da 0038).
 * A 0038 rodou (v0.0.170) antes do patch que adicionava o bloco de grants
 * reais — migração executa UMA vez. Aqui: para cada usuário real com
 * read_analyses ativo (0037), garante request_analysis no MESMO grant.
 * Idempotente: só grava se a ação faltar.
 */
migrate(
  (app) => {
    const colU = app.findCollectionByNameOrId('users')
    const colG = app.findCollectionByNameOrId('access_grants')
    for (const email of ['haisan.ecmm@gmail.com', 'anezia@haisan.com.br', 'josth7@icloud.com']) {
      try {
        const us = app.findRecordsByFilter(colU, "email='" + email + "'", '', 1, 0)
        if (!us || us.length === 0) {
          console.log('migração 0042: ' + email + ' não encontrado')
          continue
        }
        const gs = app.findRecordsByFilter(
          colG,
          "user_id='" + us[0].id + "' && revoked_at=''",
          '-created',
          5,
          0,
        )
        let alterou = false
        for (const g of gs) {
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
          if (acts.indexOf('read_analyses') >= 0 && acts.indexOf('request_analysis') < 0) {
            acts.push('request_analysis')
            g.set('actions', JSON.stringify(acts))
            app.save(g)
            alterou = true
          }
        }
        console.log(
          'migração 0042: ' + email + (alterou ? ' — request_analysis adicionado' : ' — já ok'),
        )
      } catch (eG) {
        console.log('migração 0042: ' + email + ' — ' + String(eG).slice(0, 140))
      }
    }
  },
  (app) => {
    console.log('migração 0042 revertida: grants permanecem (rollback não remove dados)')
  },
)
