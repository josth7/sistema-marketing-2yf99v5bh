/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0025 — base de acesso: role_catalog, access_grants, access_audit
 * (SPEC-2-005, card f9a2a3eb, CA-2-12).
 *
 * - role_catalog: papéis CANDIDATOS (direction, management, marketing, agency) com
 *   actions propostas — a matriz só VALE de fato após aprovação (card 5b1de184).
 * - access_grants: permissões por usuário com escopo/validade/revogação;
 *   UNIQUE(user_id, role, version); nenhum grant REAL nesta task — só os de TESTE
 *   dos fixtures (DECISÃO DO CLIENTE 14/10: manter testes humanos funcionando).
 * - access_audit: trilha append-only (sem update/delete).
 * - NOTA (AP-2026-10-08-1410): new Collection aceita SOMENTE plain objects em fields.
 */
migrate(
  (app) => {
    // ---- role_catalog ----
    try {
      app.findCollectionByNameOrId('role_catalog')
      console.log('migração 0025: role_catalog já existe')
    } catch (_) {
      var colR = new Collection({
        name: 'role_catalog',
        type: 'base',
        listRule: "@request.auth.id != ''",
        viewRule: "@request.auth.id != ''",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'role', type: 'text', required: true, max: 40 },
          { name: 'label', type: 'text', required: true, max: 80 },
          { name: 'actions', type: 'json', maxSize: 100000 },
          { name: 'description', type: 'text', max: 500 },
          { name: 'enabled', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX IF NOT EXISTS idx_role_unico ON role_catalog (role)'],
      })
      app.save(colR)

      // seed dos 4 papéis da SPEC (CANDIDATOS — aprovação no card 5b1de184)
      const roles = [
        {
          role: 'direction',
          label: 'Direção',
          actions: [
            'read_metrics',
            'read_alerts',
            'read_decisions',
            'read_reports',
            'approve_criteria',
            'approve_reports',
            'manage_access',
          ],
          description:
            'Direção da Haisan — lê tudo, aprova critérios/relatórios e gerencia acessos (matriz pendente de aprovação)',
        },
        {
          role: 'management',
          label: 'Gerência',
          actions: [
            'read_metrics',
            'read_alerts',
            'read_decisions',
            'read_reports',
            'manage_criteria',
            'approve_criteria',
            'manage_decisions',
          ],
          description:
            'Gerência — lê tudo, opera critérios/decisões e aprova critérios (matriz pendente)',
        },
        {
          role: 'marketing',
          label: 'Marketing',
          actions: [
            'read_metrics',
            'read_alerts',
            'read_decisions',
            'read_reports',
            'manage_criteria',
            'manage_decisions',
          ],
          description:
            'Marketing interno — lê tudo, cria rascunhos de critérios e opera decisões (matriz pendente)',
        },
        {
          role: 'agency',
          label: 'Agência',
          actions: ['read_metrics'],
          description:
            'Agência (Movienari) — NENHUM acesso por padrão; só leitura em escopos expressamente aprovados (transitória até 31/12/2026)',
        },
      ]
      for (const r of roles) {
        var rec = new Record(app.findCollectionByNameOrId('role_catalog'))
        rec.set('role', r.role)
        rec.set('label', r.label)
        rec.set('actions', JSON.stringify(r.actions))
        rec.set('description', r.description)
        rec.set('enabled', true)
        app.save(rec)
      }
      console.log('migração 0025: role_catalog criado com 4 papéis candidatos')
    }

    // ---- access_grants ----
    try {
      app.findCollectionByNameOrId('access_grants')
      console.log('migração 0025: access_grants já existe')
    } catch (_) {
      var colG = new Collection({
        name: 'access_grants',
        type: 'base',
        listRule: 'user_id = @request.auth.id',
        viewRule: 'user_id = @request.auth.id',
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          {
            name: 'user_id',
            type: 'relation',
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
            required: true,
          },
          { name: 'role', type: 'text', required: true, max: 40 },
          { name: 'scope_accounts', type: 'json', maxSize: 100000 },
          { name: 'scope_channels', type: 'json', maxSize: 100000 },
          { name: 'actions', type: 'json', maxSize: 100000 },
          { name: 'valid_from', type: 'date' },
          { name: 'valid_until', type: 'date' },
          {
            name: 'approved_by',
            type: 'relation',
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          { name: 'approved_at', type: 'date' },
          { name: 'revoked_at', type: 'date' },
          { name: 'version', type: 'number', onlyInt: true, min: 1 },
          { name: 'note', type: 'text', max: 300 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_grant_unica ON access_grants (user_id, role, version)',
        ],
      })
      app.save(colG)
      console.log('migração 0025: access_grants criado (RLS por usuário)')
    }

    // ---- access_audit ----
    try {
      app.findCollectionByNameOrId('access_audit')
      console.log('migração 0025: access_audit já existe')
    } catch (_) {
      var colA = new Collection({
        name: 'access_audit',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'at', type: 'date', required: true },
          {
            name: 'actor',
            type: 'relation',
            collectionId: '_pb_users_auth_',
            maxSelect: 1,
          },
          { name: 'acao', type: 'text', required: true, max: 80 },
          { name: 'alvo', type: 'text', max: 200 },
          { name: 'detalhe', type: 'json', maxSize: 200000 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
      })
      app.save(colA)
      console.log('migração 0025: access_audit criado (append-only)')
    }

    // ---- grants de TESTE para os fixtures (DECISÃO DO CLIENTE 14/10) ----
    // Mantêm os fluxos humanos dos cards anteriores funcionando com os guards novos.
    // NENHUMA pessoa real recebe grant nesta task (gate: matriz aprovada — 5b1de184).
    const colU = app.findCollectionByNameOrId('users')
    const colG2 = app.findCollectionByNameOrId('access_grants')
    const colA2 = app.findCollectionByNameOrId('access_audit')

    function grantDeTeste(email, role, actions) {
      const us = app.findRecordsByFilter(colU, "email='" + email + "'", '', 1, 0)
      if (!us || us.length === 0) {
        console.log(
          'migração 0025: fixture ' + email + ' não encontrada — grant de teste não criado',
        )
        return
      }
      const uid = us[0].id
      const existentes = app.findRecordsByFilter(
        colG2,
        "user_id='" + uid + "' && role='" + role + "'",
        '',
        1,
        0,
      )
      if (existentes && existentes.length > 0) {
        console.log('migração 0025: grant de teste ' + role + ' já existe para ' + email)
        return
      }
      const g = new Record(colG2)
      g.set('user_id', uid)
      g.set('role', role)
      g.set('actions', JSON.stringify(actions))
      g.set('scope_accounts', JSON.stringify(['*']))
      g.set('scope_channels', JSON.stringify(['*']))
      g.set('approved_at', new Date().toISOString())
      g.set('version', 1)
      g.set(
        'note',
        'grant de TESTE (fixture) — card f9a2a3eb; revogar quando a matriz real for aprovada (5b1de184)',
      )
      app.save(g)
      const a = new Record(colA2)
      a.set('at', new Date().toISOString())
      a.set('actor', uid)
      a.set('acao', 'criou_grant_teste')
      a.set('alvo', email + ' → ' + role)
      a.set(
        'detalhe',
        JSON.stringify({ origem: 'migracao_0025', card: 'f9a2a3eb', tipo: 'fixture' }),
      )
      app.save(a)
      console.log('migração 0025: grant de teste ' + role + ' criado para ' + email)
    }

    grantDeTeste('criterios.fixture.criador@haisan.com.br', 'marketing', [
      'read_metrics',
      'read_alerts',
      'read_decisions',
      'read_reports',
      'manage_criteria',
      'manage_decisions',
    ])
    grantDeTeste('criterios.fixture.aprovador@haisan.com.br', 'management', [
      'read_metrics',
      'read_alerts',
      'read_decisions',
      'read_reports',
      'manage_criteria',
      'approve_criteria',
      'manage_decisions',
    ])
  },
  (app) => {
    // reversão: remove as 3 coleções (grants de teste vão junto — sem dados reais)
    for (const nome of ['access_audit', 'access_grants', 'role_catalog']) {
      try {
        var c = app.findCollectionByNameOrId(nome)
        app.delete(c)
      } catch (e) {}
    }
    console.log('migração 0025 revertida')
  },
)
