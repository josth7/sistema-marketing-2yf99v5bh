/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0015 — coleção decisions (SPEC-2-003, card edd618c7).
 *
 * CA-2-08: cadastro de decisões com responsável e data de revisão OBRIGATÓRIOS,
 * validados no servidor pelas rotas /backend/v1/decisions (hook decisoes.js).
 * Campos conforme a SPEC: uuid, source_alert_id (opcional, mesmo escopo),
 * scope, title, justification, planned_action, responsible_user, review_date
 * (YYYY-MM-DD), state (open/in_review/closed), revision, created_by/at,
 * updated_at, review_outcome (opcional), closed_at, history (append-only).
 *
 * NOTA DE ESCRITA (AP-2026-10-08-1410): new Collection aceita SOMENTE plain
 * objects em fields — construtores tipados são descartados silenciosamente.
 * Conferir schema com get_collection_details após aplicar.
 *
 * RLS: leitura exige autenticação; escrita só via rotas do servidor (fechadas).
 * Job de lembrete (CA-2-09) NÃO é desta task — é do card a434ca96.
 */
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('decisions')
      console.log('migração 0015: decisions já existe — nada a fazer')
      return
    } catch (_) {
      // não existe — seguir
    }

    const col = new Collection({
      name: 'decisions',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'uuid', type: 'text', required: true, max: 36 },
        { name: 'source_alert_id', type: 'text', max: 30 },
        { name: 'scope', type: 'text', max: 60 },
        { name: 'title', type: 'text', required: true, max: 200 },
        { name: 'justification', type: 'text', required: true, max: 4000 },
        { name: 'planned_action', type: 'text', required: true, max: 4000 },
        {
          name: 'responsible_user',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'review_date', type: 'text', max: 10 },
        {
          name: 'state',
          type: 'select',
          required: true,
          maxSelect: 1,
          values: ['open', 'in_review', 'closed'],
        },
        { name: 'revision', type: 'number', required: true, onlyInt: true, min: 1 },
        {
          name: 'created_by',
          type: 'relation',
          collectionId: '_pb_users_auth_',
          maxSelect: 1,
        },
        { name: 'created_at', type: 'date' },
        { name: 'updated_at', type: 'date' },
        { name: 'review_outcome', type: 'text', max: 4000 },
        { name: 'closed_at', type: 'date' },
        { name: 'history', type: 'json', maxSize: 2000000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE INDEX idx_decisions_uuid_revision ON decisions (uuid, revision)',
        'CREATE INDEX idx_decisions_state ON decisions (state)',
      ],
    })
    app.save(col)

    console.log('migração 0015 aplicada: coleção decisions criada (plain objects)')
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('decisions')
      app.delete(col)
    } catch (e) {}
    console.log('migração 0015 revertida')
  },
)
