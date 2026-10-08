/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0014 — recria alert_criteria com CAMPOS (corrige a 0012, card fc6d0f5a).
 *
 * Causa raiz (AP-2026-10-02-1758, reincidente): a 0012 usou construtores
 * tipados (new TextField...) dentro de new Collection — PocketBase descarta o
 * array de fields silenciosamente. Sintomas provados ao vivo (07/10): POST
 * retornava draft "em memória", approve lia state=null (409 "estado null"),
 * filtro por uuid dava 400. A coleção ficava sem as colunas.
 *
 * Correção: recriar com PLAIN OBJECTS (mesma sintaxe da migração 0005).
 * Dados: só existiam rascunhos de teste (sem dado real) — descartáveis.
 */
migrate(
  (app) => {
    // remover a coleção sem campos (idempotente)
    try {
      const antiga = app.findCollectionByNameOrId('alert_criteria')
      app.delete(antiga)
      console.log('migração 0014: alert_criteria antiga (sem campos) removida')
    } catch (_) {
      console.log('migração 0014: alert_criteria não existia — criando')
    }

    const col = new Collection({
      name: 'alert_criteria',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'uuid', type: 'text', required: true, max: 36 },
        { name: 'version', type: 'number', required: true, onlyInt: true, min: 1 },
        {
          name: 'state',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['draft', 'approved', 'archived'],
        },
        { name: 'metric', type: 'text', max: 30 },
        { name: 'canal', type: 'text', max: 30 },
        { name: 'objetivo', type: 'text', max: 20 },
        { name: 'result_type', type: 'text', max: 20 },
        { name: 'natureza', type: 'text', max: 12 },
        { name: 'direction', type: 'text', max: 10 },
        { name: 'threshold_pct', type: 'number', min: 0.0001 },
        { name: 'min_base', type: 'number', min: 0.0001 },
        {
          name: 'period_kind',
          type: 'select',
          required: false,
          maxSelect: 1,
          values: ['monthly', 'calendar_half'],
        },
        { name: 'comparison_mode', type: 'text', max: 30 },
        {
          name: 'responsible_user',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'created_by', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'approved_by', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'approved_at', type: 'date' },
        { name: 'history', type: 'json', maxSize: 2000000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_criteria_uuid_version ON alert_criteria (uuid, version)',
        'CREATE INDEX idx_criteria_state ON alert_criteria (state)',
      ],
    })
    app.save(col)

    // reafirmar o cron do avaliador PAUSADO (contrato: enabled=false por padrão)
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
      row.set('reason', 'aguardando regra aprovada no workshop (CL-003) — card fc6d0f5a')
      app.save(row)
    } catch (eCron) {
      console.log('migração 0014: cron pausado não gravado — ' + String(eCron).slice(0, 120))
    }

    console.log('migração 0014 aplicada: alert_criteria recriada COM campos (plain objects)')
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('alert_criteria')
      app.delete(col)
    } catch (e) {}
    console.log('migração 0014 revertida')
  },
)
