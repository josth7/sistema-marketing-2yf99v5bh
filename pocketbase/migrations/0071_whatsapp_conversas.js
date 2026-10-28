/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0071 — conversas e sinais do WhatsApp (SPEC-3-005, CA-3-15).
 *
 * - whatsapp_conversas: uma por número + contato. Guarda a prévia e o estado da
 *   triagem. Regras de API nulas (só pelas rotas).
 * - whatsapp_sinais: SEM conteúdo (um por conversa) — é a ÚNICA coleção nova com
 *   regra de leitura, para o tempo real respeitar quem pode ver cada conversa.
 *   `leitores` é calculado pelo servidor; a regra é
 *   listRule = viewRule = "@request.auth.id != '' && leitores.id ?= @request.auth.id".
 *
 * O desenho é o da SPEC: se a regra falhar, o que vaza no máximo são ids e
 * horários — nunca texto, nome ou telefone.
 *
 * Campos como PLAIN OBJECTS (lição reincidente 08/10).
 */

migrate(
  (app) => {
    // ---------- whatsapp_conversas ----------
    let colConv
    try {
      colConv = app.findCollectionByNameOrId('whatsapp_conversas')
    } catch (_) {
      colConv = new Collection({
        name: 'whatsapp_conversas',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'conexao', type: 'text', max: 40 },
          { name: 'contato_telefone', type: 'text', max: 20 },
          { name: 'contato_lid', type: 'text', max: 80 },
          { name: 'contato_nome', type: 'text', max: 200 },
          { name: 'lead', type: 'text', max: 40 },
          { name: 'ultima_mensagem_em', type: 'date' },
          { name: 'ultima_previa', type: 'text', max: 160 },
          { name: 'ultimo_autor', type: 'text', max: 40 },
          { name: 'total_mensagens', type: 'number' },
          {
            name: 'estado',
            type: 'select',
            maxSelect: 1,
            values: ['triagem', 'transferida', 'pausada_humano', 'sem_ia'],
          },
          {
            name: 'canal',
            type: 'select',
            maxSelect: 1,
            values: ['google', 'meta', 'organico', 'sem_gatilho'],
          },
          { name: 'etapa_atual', type: 'text', max: 20 },
          { name: 'pausada_ate', type: 'date' },
          { name: 'transferida_em', type: 'date' },
          { name: 'ultima_resposta_ia_em', type: 'date' },
          { name: 'followup_enviado_em', type: 'date' },
          { name: 'fora_horario_avisado_em', type: 'date' },
          { name: 'fixture', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_wa_conv_unica ON whatsapp_conversas (conexao, contato_telefone)',
          'CREATE INDEX idx_wa_conv_lead ON whatsapp_conversas (lead)',
          'CREATE INDEX idx_wa_conv_ultima ON whatsapp_conversas (ultima_mensagem_em)',
        ],
      })
      app.save(colConv)
    }

    // ---------- whatsapp_sinais (única com regra de leitura) ----------
    let colSin
    try {
      colSin = app.findCollectionByNameOrId('whatsapp_sinais')
    } catch (_) {
      colSin = new Collection({
        name: 'whatsapp_sinais',
        type: 'base',
        listRule: "@request.auth.id != '' && leitores.id ?= @request.auth.id",
        viewRule: "@request.auth.id != '' && leitores.id ?= @request.auth.id",
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'conversa', type: 'text', max: 40 },
          { name: 'conexao', type: 'text', max: 40 },
          {
            name: 'papel_conexao',
            type: 'select',
            maxSelect: 1,
            values: ['central', 'vendedor'],
          },
          { name: 'lead', type: 'text', max: 40 },
          { name: 'ultima_em', type: 'date' },
          { name: 'contador', type: 'number' },
          { name: 'leitores', type: 'relation', collectionId: '_pb_users_auth_', maxSelect: 50 },
          { name: 'fixture', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_wa_sin_conversa ON whatsapp_sinais (conversa)'],
      })
      app.save(colSin)
    }

    const c1 = app.findCollectionByNameOrId('whatsapp_conversas')
    const c2 = app.findCollectionByNameOrId('whatsapp_sinais')
    console.log('0071: conversas=' + c1.fields.length + ' sinais=' + c2.fields.length)
  },
  (app) => {
    for (const nome of ['whatsapp_sinais', 'whatsapp_conversas']) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (e) {}
    }
    console.log('0071 revertida')
  },
)
