/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0017 — coleção report_policy (SPEC-2-004, card a70d5ab8, CA-2-11).
 *
 * Política de envio do relatório quinzenal:
 * - registro REAL: fixture=false, enabled=false, recipients=[] — ativação só com
 *   calendário/destinatários confirmados pelo dono (DH-07) e aprovação registrada.
 * - registro FIXTURE: fixture=true, enabled=true, aprovada pelo usuário fixture —
 *   prova do job automático (CA-2-11) sem tocar na política real.
 *
 * NOTA (AP-2026-10-08-1410): new Collection aceita SOMENTE plain objects em fields.
 * Padrão de existência (0016): try/catch em findCollectionByNameOrId — quando NÃO
 * existe, o método LANÇA "no rows in result set" (não devolve null).
 */
migrate(
  (app) => {
    try {
      app.findCollectionByNameOrId('report_policy')
      console.log('migração 0017: report_policy já existe — nada a fazer')
      return
    } catch (_) {
      // não existe — criar
    }

    var col = new Collection({
      name: 'report_policy',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        { name: 'fixture', type: 'bool' },
        { name: 'enabled', type: 'bool' },
        { name: 'timezone', type: 'text', required: true, max: 40 },
        { name: 'periods', type: 'text', required: true, max: 40 },
        { name: 'template_version', type: 'text', required: true, max: 20 },
        { name: 'policy_version', type: 'number', required: true, onlyInt: true, min: 1 },
        { name: 'approved_by', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 1 },
        { name: 'approved_at', type: 'date' },
        { name: 'recipient_user_ids', type: 'json', maxSize: 100000 },
        { name: 'approval_record', type: 'text', max: 2000 },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: [
        'CREATE UNIQUE INDEX IF NOT EXISTS idx_report_policy_fixture ON report_policy (fixture)',
      ],
    })
    app.save(col)

    // registro REAL — desativado até confirmação do dono (DH-07)
    var real = new Record(col)
    real.set('fixture', false)
    real.set('enabled', false)
    real.set('timezone', 'America/Sao_Paulo')
    real.set('periods', 'calendar_halves')
    real.set('template_version', '1.0.0')
    real.set('policy_version', 1)
    real.set('recipient_user_ids', JSON.stringify([]))
    real.set(
      'approval_record',
      'aguardando confirmação do calendário e destinatários pelo dono (DH-07)',
    )
    app.save(real)

    // registro FIXTURE — política de teste aprovada (prova CA-2-11)
    var aprovador = null
    try {
      var colU = app.findCollectionByNameOrId('users')
      var users = app.findRecordsByFilter(
        colU,
        "email='criterios.fixture.aprovador@haisan.com.br'",
        '',
        1,
        0,
      )
      if (users && users.length > 0) aprovador = users[0]
    } catch (e) {
      console.log('migração 0017: usuário fixture não encontrado: ' + String(e).slice(0, 120))
    }
    var fix = new Record(col)
    fix.set('fixture', true)
    fix.set('enabled', true)
    fix.set('timezone', 'America/Sao_Paulo')
    fix.set('periods', 'calendar_halves')
    fix.set('template_version', '1.0.0')
    fix.set('policy_version', 1)
    if (aprovador) {
      fix.set('approved_by', aprovador.id)
      fix.set('recipient_user_ids', JSON.stringify([aprovador.id]))
    } else {
      fix.set('recipient_user_ids', JSON.stringify([]))
    }
    fix.set('approved_at', new Date().toISOString())
    fix.set('approval_record', 'política de teste (fixture) aprovada para a prova CA-2-11')
    app.save(fix)

    console.log('migração 0017 aplicada: report_policy (real desativada + fixture ativa)')
  },
  (app) => {
    try {
      var col = app.findCollectionByNameOrId('report_policy')
      app.delete(col)
    } catch (e) {}
    console.log('migração 0017 revertida')
  },
)
