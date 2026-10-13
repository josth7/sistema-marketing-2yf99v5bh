/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0018 — coleção inbox_items (SPEC-2-004, card a70d5ab8, CA-2-11).
 *
 * Caixa de entrada do sistema (entrega interna autenticada — sem e-mail/WhatsApp):
 * - cada item é 1 relatório × 1 destinatário; UNIQUE(report_id, user_id) impede duplicar
 *   em replay/concorrência/retry (prova CA-2-11).
 * - RLS: o usuário vê SOMENTE os próprios itens; escrita só via hooks do servidor
 *   (job/retry/republicação — nunca pelo cliente).
 *
 * NOTA (AP-2026-10-08-1410): new Collection aceita SOMENTE plain objects em fields.
 */
migrate(
  (app) => {
    if (!app.findCollectionByNameOrId('inbox_items')) {
      var col = new Collection({
        name: 'inbox_items',
        type: 'base',
        listRule: 'user_id = @request.auth.id',
        viewRule: 'user_id = @request.auth.id',
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'report_id', type: 'text', required: true, max: 30 },
          {
            name: 'user_id',
            type: 'relation',
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
            required: true,
          },
          { name: 'scope', type: 'text', max: 60 },
          {
            name: 'status',
            type: 'select',
            required: true,
            maxSelect: 1,
            values: ['pending', 'delivered', 'failed'],
          },
          { name: 'attempts', type: 'number', onlyInt: true, min: 0 },
          { name: 'last_error', type: 'text', max: 500 },
          { name: 'delivered_at', type: 'date' },
          { name: 'read_at', type: 'date' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_unica ON inbox_items (report_id, user_id)',
        ],
      })
      app.save(col)
      console.log('migração 0018 aplicada: inbox_items (RLS por destinatário)')
    } else {
      console.log('migração 0018: inbox_items já existe — nada a fazer')
    }
  },
  (app) => {
    try {
      var col = app.findCollectionByNameOrId('inbox_items')
      app.delete(col)
    } catch (e) {}
    console.log('migração 0018 revertida')
  },
)
