/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0016 — coleção reports (SPEC-2-004, card 3b491438, CA-2-10).
 *
 * Snapshot IMUTÁVEL do relatório executivo de quinzena fechada:
 * - chave única: period_start+period_end+scope+template_version+policy_version+report_revision
 *   (policy_version e scope gravados como '' quando ausentes — NULL quebra UNIQUE no SQLite)
 * - state draft/ready/delivered/failed (neste card só draft — envio é do card a70d5ab8)
 * - data_snapshot_json: agregados por natureza/objetivo (NUNCA dump de campanhas cruas)
 *
 * NOTA (AP-2026-10-08-1410): new Collection aceita SOMENTE plain objects em fields.
 * RLS: leitura exige autenticação; escrita só via rotas do hook relatorios.js.
 */
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('reports')
      console.log('migração 0016: reports já existe — nada a fazer')
      return
    } catch (_) {
      // não existe — seguir
    }

    const col = new Collection({
      name: 'reports',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'uuid', type: 'text', required: true, max: 36 },
        { name: 'period_start', type: 'text', required: true, max: 10 },
        { name: 'period_end', type: 'text', required: true, max: 10 },
        { name: 'quinzena', type: 'number', required: true, onlyInt: true, min: 1, max: 2 },
        { name: 'scope', type: 'text', max: 60 },
        { name: 'template_version', type: 'text', required: true, max: 20 },
        { name: 'policy_version', type: 'text', max: 20 },
        { name: 'report_revision', type: 'number', required: true, onlyInt: true, min: 1 },
        { name: 'supersedes_id', type: 'text', max: 30 },
        { name: 'revision_reason', type: 'text', max: 1000 },
        {
          name: 'generated_by',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'generated_at', type: 'date' },
        {
          name: 'state',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['draft', 'ready', 'delivered', 'failed'],
        },
        { name: 'origem', type: 'text', required: true, max: 20 },
        { name: 'data_snapshot_json', type: 'json', maxSize: 2000000 },
        { name: 'coverage_by_source', type: 'json', maxSize: 200000 },
        { name: 'comparison_eligibility', type: 'json', maxSize: 100000 },
        { name: 'warnings', type: 'json', maxSize: 200000 },
        { name: 'alert_refs', type: 'json', maxSize: 100000 },
        { name: 'decision_refs', type: 'json', maxSize: 200000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_reports_unica ON reports (period_start, period_end, scope, template_version, policy_version, report_revision)',
        'CREATE INDEX idx_reports_periodo ON reports (period_start, period_end)',
      ],
    })
    app.save(col)

    console.log('migração 0016 aplicada: coleção reports criada (plain objects)')
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('reports')
      app.delete(col)
    } catch (e) {}
    console.log('migração 0016 revertida')
  },
)
