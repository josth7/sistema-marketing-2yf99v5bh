/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0012 — coleção alert_criteria (SPEC-2-002, card fc6d0f5a).
 *
 * Cadastro de critérios de alerta em RASCUNHO (CA-2-05): estados draft/approved/
 * archived e validação no servidor. Nenhum limiar fictício aprovado — a aprovação
 * real dos limiares é da Anézia (CL-003, workshop 22/10); aqui existe só a
 * mecânica de cadastro/versionamento.
 *
 * Campos (contrato da SPEC): uuid (regra lógica; versões compartilham), version
 * (edita draft mantém; aprovar/arquivar e reabrir cria nova — prova antiga
 * intacta), state, metric/canal/objetivo/result_type/natureza (recorte),
 * direction, threshold_pct (>0), min_base (>0), period_kind (monthly|
 * calendar_half — aprovação sem period_kind = 422), comparison_mode fixo
 * 'closed_period_total', responsible_user/created_by/approved_by (rel. users),
 * approved_at e history (trilha JSON).
 *
 * RLS: leitura exige autenticação; escrita só via rotas do servidor (fechadas).
 * Cron do avaliador: linha PAUSADA em _cron_settings (enabled=false por padrão).
 */
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('alert_criteria')
      console.log('migração 0012: alert_criteria já existe — nada a fazer')
      return
    } catch (_) {
      // não existe — seguir
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
        new TextField({ name: 'uuid', required: true, max: 36 }),
        new NumberField({ name: 'version', required: true, onlyInt: true, min: 1 }),
        new SelectField({
          name: 'state',
          required: true,
          maxSelect: 1,
          values: ['draft', 'approved', 'archived'],
        }),
        new TextField({ name: 'metric', max: 30 }),
        new TextField({ name: 'canal', max: 30 }),
        new TextField({ name: 'objetivo', max: 20 }),
        new TextField({ name: 'result_type', max: 20 }),
        new TextField({ name: 'natureza', max: 12 }),
        new TextField({ name: 'direction', max: 10 }),
        new NumberField({ name: 'threshold_pct', min: 0.0001 }),
        new NumberField({ name: 'min_base', min: 0.0001 }),
        new SelectField({
          name: 'period_kind',
          required: false,
          maxSelect: 1,
          values: ['monthly', 'calendar_half'],
        }),
        new TextField({ name: 'comparison_mode', max: 30 }),
        new RelationField({
          name: 'responsible_user',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        }),
        new RelationField({
          name: 'created_by',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        }),
        new RelationField({
          name: 'approved_by',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        }),
        new DateField({ name: 'approved_at' }),
        new JSONField({ name: 'history', maxSize: 2000000 }),
        new AutodateField({ name: 'created', onCreate: true, onUpdate: false }),
        new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }),
      ],
      indexes: [
        'CREATE INDEX idx_criteria_uuid_version ON alert_criteria (uuid, version)',
        'CREATE INDEX idx_criteria_state ON alert_criteria (state)',
      ],
    })
    app.save(col)

    // ---- Cron do avaliador PAUSADO (contrato: enabled=false por padrão) ----
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
      console.log('migração 0012: cron pausado não gravado — ' + String(eCron).slice(0, 120))
    }

    console.log('migração 0012 aplicada: alert_criteria + cron do avaliador pausado')
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('alert_criteria')
      app.delete(col)
    } catch (e) {}
    try {
      const row = app.findFirstRecordByData('_cron_settings', 'job', 'alerta_avaliador_diario')
      if (row) app.delete(row)
    } catch (e) {}
    console.log('migração 0012 revertida')
  },
)
