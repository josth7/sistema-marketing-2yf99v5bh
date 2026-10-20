/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0038 — Card "Disparar a análise de IA ao fechar a quinzena ou a
 * pedido" (SPEC-3-001, CA-3-03): coleções de apoio do disparo + grants.
 * - metricas_fixtures: fonte fixture das provas RN-03/RN-07 (isolada do painel
 *   real; o painel real lê metricas_diarias origem='api' — nunca esta);
 * - canal_avisos: motivo do último bloqueio do disparo (cobertura incompleta,
 *   teto mensal) para a tela de saúde do canal;
 * - marketing.a ganha request_analysis no grant fixture de escopo (prova
 *   RN-07: escopo do grant no pedido manual);
 * - grants REAIS (mesmo padrão da 0037, validado pelo dono no teste do card 2):
 *   request_analysis entra junto com read_analyses para o teste humano do
 *   card 3 (a matriz definitiva de grants segue sendo decisão do dono — DH-10).
 * Regras de API NULAS (acesso só pelas rotas /backend/v1/) — prova negativa.
 * Plain objects nos fields (lição AP-2026-10-02/14: construtores tipados são
 * descartados silenciosamente).
 */
migrate(
  (app) => {
    let colMF
    try {
      colMF = app.findCollectionByNameOrId('metricas_fixtures')
      console.log('migração 0038: metricas_fixtures já existe')
    } catch (_) {
      colMF = new Collection({
        name: 'metricas_fixtures',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'canal', type: 'text', required: true, max: 40 },
          { name: 'conta_id', type: 'text', max: 64 },
          { name: 'conta_nome', type: 'text', max: 120 },
          { name: 'campanha_id', type: 'text', max: 64 },
          { name: 'campanha_nome', type: 'text', max: 160 },
          { name: 'objetivo', type: 'text', max: 40 },
          { name: 'natureza', type: 'text', max: 20 },
          { name: 'data', type: 'date', required: true },
          { name: 'alcance', type: 'number' },
          { name: 'impressoes', type: 'number' },
          { name: 'cliques', type: 'number' },
          { name: 'gasto', type: 'number' },
          { name: 'resultados', type: 'number' },
          { name: 'origem', type: 'text', max: 20 },
          { name: 'fixture', type: 'bool' },
        ],
        indexes: [
          'CREATE INDEX IF NOT EXISTS idx_mfix_data_canal ON metricas_fixtures (data, canal)',
        ],
      })
      app.save(colMF)
      console.log('migração 0038: metricas_fixtures criada (regras nulas)')
    }
    let colAv
    try {
      colAv = app.findCollectionByNameOrId('canal_avisos')
      console.log('migração 0038: canal_avisos já existe')
    } catch (_) {
      colAv = new Collection({
        name: 'canal_avisos',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'motivo', type: 'text', required: true, max: 300 },
          { name: 'origem', type: 'text', max: 20 },
          { name: 'criado_em', type: 'date' },
        ],
      })
      app.save(colAv)
      console.log('migração 0038: canal_avisos criada (regras nulas)')
    }
    // grant fixture: marketing.a passa a ter request_analysis (prova RN-07)
    try {
      const colU = app.findCollectionByNameOrId('users')
      const colG = app.findCollectionByNameOrId('access_grants')
      const us = app.findRecordsByFilter(colU, "email='marketing.a@haisan.com.br'", '', 1, 0)
      if (us && us.length > 0) {
        const gs = app.findRecordsByFilter(
          colG,
          "user_id='" + us[0].id + "' && revoked_at='' && note~'fixtures fase 3'",
          '',
          1,
          0,
        )
        if (!gs || gs.length === 0) {
          // fallback: grant fixture de escopo (0027) — cria o grant da fase 3
          const g = new Record(colG)
          g.set('user_id', us[0].id)
          g.set('role', 'marketing')
          g.set('actions', JSON.stringify(['read_analyses', 'request_analysis']))
          g.set('scope_accounts', JSON.stringify(['ACC_A']))
          g.set('scope_channels', JSON.stringify(['meta_ads']))
          g.set('valid_from', '')
          g.set('approved_at', new Date().toISOString())
          g.set('version', 1)
          g.set('note', 'fixtures fase 3 — canal de análise (0038)')
          app.save(g)
          console.log(
            'migração 0038: grant fixture fase 3 criado p/ marketing.a (ACC_A/meta_ads + request_analysis)',
          )
        }
        if (gs && gs.length > 0) {
          const g = gs[0]
          let acts = []
          try {
            const raw = g.get('actions')
            acts =
              Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number'
                ? JSON.parse(String.fromCharCode.apply(null, raw))
                : typeof raw === 'string'
                  ? JSON.parse(raw)
                  : raw || []
          } catch (eA) {}
          if (acts.indexOf('request_analysis') < 0) {
            acts.push('request_analysis')
            g.set('actions', JSON.stringify(acts))
            app.save(g)
            console.log(
              'migração 0038: request_analysis adicionado ao grant fixture de marketing.a',
            )
          }
        }
      }
    } catch (eG) {
      console.log('migração 0038: grant fixture marketing.a — ' + String(eG).slice(0, 120))
    }
    // grants REAIS (mesmo padrão da 0037, validado pelo dono no teste do card 2):
    // request_analysis entra junto com read_analyses para o teste humano do
    // card 3 (a matriz definitiva de grants segue sendo decisão do dono — DH-10)
    try {
      const colU2 = app.findCollectionByNameOrId('users')
      const colG2 = app.findCollectionByNameOrId('access_grants')
      for (const email of ['haisan.ecmm@gmail.com', 'anezia@haisan.com.br', 'josth7@icloud.com']) {
        const us2 = app.findRecordsByFilter(colU2, "email='" + email + "'", '', 1, 0)
        if (!us2 || us2.length === 0) continue
        const gs2 = app.findRecordsByFilter(
          colG2,
          "user_id='" + us2[0].id + "' && revoked_at=''",
          '-created',
          5,
          0,
        )
        for (const g2 of gs2) {
          let acts2 = []
          try {
            const raw2 = g2.get('actions')
            acts2 =
              Array.isArray(raw2) && raw2.length > 0 && typeof raw2[0] === 'number'
                ? JSON.parse(String.fromCharCode.apply(null, raw2))
                : typeof raw2 === 'string'
                  ? JSON.parse(raw2)
                  : raw2 || []
          } catch (eA2) {}
          if (acts2.indexOf('read_analyses') >= 0 && acts2.indexOf('request_analysis') < 0) {
            acts2.push('request_analysis')
            g2.set('actions', JSON.stringify(acts2))
            app.save(g2)
            console.log('migração 0038: request_analysis adicionado ao grant de ' + email)
          }
        }
      }
    } catch (eG2) {
      console.log('migração 0038: grants reais — ' + String(eG2).slice(0, 120))
    }
  },
  (app) => {
    console.log('migração 0038 revertida: coleções de apoio permanecem (rollback não remove dados)')
  },
)
