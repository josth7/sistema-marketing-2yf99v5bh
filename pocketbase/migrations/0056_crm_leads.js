/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0056 — CRM próprio (fase 4, card 1).
 *
 * Coleções:
 * - crm_leads: leads do negócio (origem, pipeline de status, owner, escopo).
 *   UNIQUE(telefone) — dedupe por telefone (vazio = sem dedupe).
 * - crm_lead_events: trilha de eventos do lead (criado/status/nota/conversao).
 *
 * Regras: fixture separado (campo fixture); escopo por conta_id ('*' = tudo);
 * RLS no hook (mesmo modelo dos grants — deny por padrão).
 * Campos como PLAIN OBJECTS {name,type} (lição reincidente — construtores
 * tipados dentro de new Collection são descartados silenciosamente).
 */

migrate(
  (app) => {
    // ---------- crm_leads ----------
    let colLeads
    try {
      colLeads = app.findCollectionByNameOrId('crm_leads')
    } catch (_) {
      colLeads = new Collection({
        name: 'crm_leads',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '',
        fields: [
          { name: 'nome', type: 'text', required: true, max: 200 },
          { name: 'telefone', type: 'text', max: 40 },
          { name: 'email', type: 'email' },
          {
            name: 'origem',
            type: 'select',
            maxSelect: 1,
            values: ['meta', 'google', 'site', 'whatsapp', 'manual', 'importacao'],
          },
          { name: 'campanha', type: 'text', max: 200 },
          { name: 'data_lead', type: 'date' },
          {
            name: 'status',
            type: 'select',
            maxSelect: 1,
            values: ['novo', 'em_contato', 'orcamento', 'fechado', 'perdido'],
          },
          { name: 'observacoes', type: 'text', max: 2000 },
          { name: 'owner_id', type: 'text', max: 40 },
          { name: 'conta_id', type: 'text', max: 80 },
          { name: 'fixture', type: 'bool' },
          { name: 'origem_import', type: 'text', max: 80 },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_crm_leads_tel ON crm_leads (telefone) WHERE telefone != ''",
          'CREATE INDEX idx_crm_leads_status ON crm_leads (status)',
          'CREATE INDEX idx_crm_leads_owner ON crm_leads (owner_id)',
        ],
      })
      app.save(colLeads)
    }

    // ---------- crm_lead_events ----------
    let colEv
    try {
      colEv = app.findCollectionByNameOrId('crm_lead_events')
    } catch (_) {
      colEv = new Collection({
        name: 'crm_lead_events',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '',
        fields: [
          { name: 'lead_id', type: 'text', required: true, max: 40 },
          {
            name: 'tipo',
            type: 'select',
            maxSelect: 1,
            values: ['criado', 'status', 'nota', 'conversao'],
          },
          { name: 'texto', type: 'text', max: 2000 },
          { name: 'user_id', type: 'text', max: 40 },
          { name: 'fixture', type: 'bool' },
        ],
        indexes: ['CREATE INDEX idx_crm_ev_lead ON crm_lead_events (lead_id)'],
      })
      app.save(colEv)
    }

    // conferência pós-criação (lição: conferir schema depois de criar)
    const c1 = app.findCollectionByNameOrId('crm_leads')
    const c2 = app.findCollectionByNameOrId('crm_lead_events')
    console.log(
      '0056: crm_leads campos=' + c1.fields.length + ', crm_lead_events campos=' + c2.fields.length,
    )
  },
  (app) => {
    // rollback
    try {
      app.delete(app.findCollectionByNameOrId('crm_lead_events'))
    } catch (_) {}
    try {
      app.delete(app.findCollectionByNameOrId('crm_leads'))
    } catch (_) {}
  },
)
