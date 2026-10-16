/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0029 — coleção alerts (fila de análise) + alertas_fixtures
 * (SPEC-2-002, card f7591165, CA-2-06/07).
 *
 * alerts: 1 alerta por (critério, versão, grupo, período atual) — UNIQUE garante
 * idempotência do replay (CA-2-07); snapshots de valores nunca reescritos.
 * Transições: open → in_review → decided (exige decisão vinculada) → closed;
 * fechamento direto só pelo responsável com justificativa (auditada no history).
 *
 * alertas_fixtures: dados de teste ISOLADOS (nunca em metricas_diarias — não
 * poluem painel/relatórios reais). O avaliador só lê esta coleção para critérios
 * criados por usuários fixture; critérios reais leem metricas_diarias origem='api'.
 * Dataset demonstrativo (origem='demonstracao') NUNCA gera alerta (CA-2-07).
 *
 * Grant de TESTE manage_alerts p/ aprovador fixture (prova de transição autorizada;
 * criador fixture fica só com read_alerts → prova 403). Matriz real ganha
 * manage_alerts quando aprovada (workshop CL-003 / card 5b1de184).
 *
 * NOTA (AP-2026-10-08-1410): new Collection aceita SOMENTE plain objects em fields.
 * Cron do avaliador reafirmado PAUSADO (gate CL-003 — workshop 22/10).
 */
migrate(
  (app) => {
    // ---- alerts ----
    try {
      app.findCollectionByNameOrId('alerts')
      console.log('migração 0029: alerts já existe')
    } catch (_) {
      const col = new Collection({
        name: 'alerts',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'criterion_id', type: 'text', required: true, max: 30 },
          { name: 'criterion_uuid', type: 'text', max: 36 },
          { name: 'criterion_version', type: 'number', required: true, onlyInt: true, min: 1 },
          { name: 'group_key', type: 'text', required: true, max: 120 },
          { name: 'metric', type: 'text', required: true, max: 30 },
          { name: 'canal', type: 'text', max: 30 },
          { name: 'objetivo', type: 'text', max: 20 },
          { name: 'result_type', type: 'text', max: 20 },
          { name: 'natureza', type: 'text', max: 12 },
          { name: 'direction', type: 'text', max: 10 },
          { name: 'period_kind', type: 'text', max: 20 },
          { name: 'period_current_start', type: 'text', max: 10 },
          { name: 'period_current_end', type: 'text', max: 10 },
          { name: 'period_prev_start', type: 'text', max: 10 },
          { name: 'period_prev_end', type: 'text', max: 10 },
          { name: 'current_value', type: 'number' },
          { name: 'previous_value', type: 'number' },
          { name: 'variation_pct', type: 'number' },
          { name: 'trigger_summary', type: 'text', max: 400 },
          {
            name: 'responsible_user',
            type: 'relation',
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          { name: 'decision_id', type: 'text', max: 30 },
          {
            name: 'state',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['open', 'in_review', 'decided', 'closed'],
          },
          { name: 'history', type: 'json', maxSize: 2000000 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_alert_unica ON alerts (criterion_id, criterion_version, group_key, period_current_start, period_current_end)',
          'CREATE INDEX idx_alert_state ON alerts (state)',
        ],
      })
      app.save(col)
      console.log('migração 0029: coleção alerts criada (plain objects)')
    }

    // ---- alertas_fixtures (dados de teste isolados) ----
    try {
      app.findCollectionByNameOrId('alertas_fixtures')
      console.log('migração 0029: alertas_fixtures já existe')
    } catch (_) {
      const colF = new Collection({
        name: 'alertas_fixtures',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'canal', type: 'text', required: true, max: 30 },
          { name: 'objetivo', type: 'text', required: true, max: 20 },
          { name: 'result_type', type: 'text', max: 20 },
          { name: 'natureza', type: 'text', required: true, max: 12 },
          { name: 'data', type: 'text', required: true, max: 10 },
          { name: 'resultados', type: 'number' },
          { name: 'cliques', type: 'number' },
          { name: 'gasto', type: 'number' },
          { name: 'impressoes', type: 'number' },
          { name: 'alcance', type: 'number' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_alertas_fix_unica ON alertas_fixtures (canal, objetivo, result_type, natureza, data)',
        ],
      })
      app.save(colF)

      // CA-2-06: grupo A meta_ads/leads/leads/pago — quinzena anterior 100, atual 75
      function fix(canal, objetivo, rt, nat, data, resultados) {
        const r = new Record(colF)
        r.set('canal', canal)
        r.set('objetivo', objetivo)
        r.set('result_type', rt)
        r.set('natureza', nat)
        r.set('data', data)
        r.set('resultados', resultados)
        app.save(r)
      }
      fix('meta_ads', 'leads', 'leads', 'pago', '2026-09-05', 60)
      fix('meta_ads', 'leads', 'leads', 'pago', '2026-09-12', 40)
      fix('meta_ads', 'leads', 'leads', 'pago', '2026-09-20', 40)
      fix('meta_ads', 'leads', 'leads', 'pago', '2026-09-25', 35)
      // grupo B google_ads/leads/conversoes — SEM dados na quinzena anterior
      // (cobertura desigual → não elegível, CA-2-07)
      fix('google_ads', 'leads', 'conversoes', 'pago', '2026-09-20', 50)
      // grupo C google_ads/vendas/conversoes — 100→80 = −20% (limite INCLUSIVO cruza)
      fix('google_ads', 'vendas', 'conversoes', 'pago', '2026-09-05', 50)
      fix('google_ads', 'vendas', 'conversoes', 'pago', '2026-09-12', 50)
      fix('google_ads', 'vendas', 'conversoes', 'pago', '2026-09-20', 40)
      fix('google_ads', 'vendas', 'conversoes', 'pago', '2026-09-25', 40)
      // grupo D meta_ads/vendas/leads — 100→81 = −19% (não cruza)
      fix('meta_ads', 'vendas', 'leads', 'pago', '2026-09-05', 50)
      fix('meta_ads', 'vendas', 'leads', 'pago', '2026-09-12', 50)
      fix('meta_ads', 'vendas', 'leads', 'pago', '2026-09-20', 40)
      fix('meta_ads', 'vendas', 'leads', 'pago', '2026-09-25', 41)
      // grupo E meta_ads/trafico/cliques — 100→10 (só p/ prova de DRAFT não dispara)
      fix('meta_ads', 'trafico', 'cliques', 'pago', '2026-09-05', 50)
      fix('meta_ads', 'trafico', 'cliques', 'pago', '2026-09-12', 50)
      fix('meta_ads', 'trafico', 'cliques', 'pago', '2026-09-20', 5)
      fix('meta_ads', 'trafico', 'cliques', 'pago', '2026-09-25', 5)
      console.log('migração 0029: alertas_fixtures criada com dados CA-2-06/07')
    }

    // ---- grant de TESTE manage_alerts p/ aprovador fixture ----
    try {
      const colU = app.findCollectionByNameOrId('users')
      const colG = app.findCollectionByNameOrId('access_grants')
      const us = app.findRecordsByFilter(
        colU,
        "email='criterios.fixture.aprovador@haisan.com.br'",
        '',
        1,
        0,
      )
      if (us && us.length > 0) {
        const gs = app.findRecordsByFilter(
          colG,
          "user_id='" + us[0].id + "' && role='management'",
          '',
          1,
          0,
        )
        if (gs && gs.length > 0) {
          const g = app.findRecordById(colG, gs[0].id)
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
          } catch (eA) {
            acts = []
          }
          if (acts.indexOf('manage_alerts') < 0) {
            acts.push('manage_alerts')
            g.set('actions', JSON.stringify(acts))
            app.save(g)
            const colA = app.findCollectionByNameOrId('access_audit')
            const a = new Record(colA)
            a.set('at', new Date().toISOString())
            a.set('actor', us[0].id)
            a.set('acao', 'ampliou_grant_teste')
            a.set('alvo', 'criterios.fixture.aprovador@haisan.com.br → +manage_alerts')
            a.set(
              'detalhe',
              JSON.stringify({ origem: 'migracao_0029', card: 'f7591165', tipo: 'fixture' }),
            )
            app.save(a)
            console.log('migração 0029: manage_alerts adicionado ao grant de teste do aprovador')
          }
        }
      }
    } catch (eG) {
      console.log('migração 0029: grant de teste não alterado — ' + String(eG).slice(0, 120))
    }

    // ---- reafirma cron do avaliador PAUSADO (gate CL-003) ----
    try {
      const cron = app.findCollectionByNameOrId('_cron_settings')
      let row
      try {
        row = app.findFirstRecordByData('_cron_settings', 'job', 'alerta_avaliador_diario')
      } catch (_) {
        row = new Record(cron)
        row.set('job', 'alerta_avaliador_diario')
      }
      row.set('disabled', true)
      row.set('reason', 'aguardando regras aprovadas no workshop CL-003 (22/10) — card f7591165')
      app.save(row)
    } catch (eCron) {
      console.log('migração 0029: cron pausado não gravado — ' + String(eCron).slice(0, 120))
    }

    console.log('migração 0029 aplicada: alerts + alertas_fixtures + grant teste + cron pausado')
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('alerts'))
    } catch (e) {}
    try {
      app.delete(app.findCollectionByNameOrId('alertas_fixtures'))
    } catch (e) {}
    console.log('migração 0029 revertida')
  },
)
