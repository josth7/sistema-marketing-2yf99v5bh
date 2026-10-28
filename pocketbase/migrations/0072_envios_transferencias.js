/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0072 — fila de envios e pedidos de transferência (SPEC-3-005, CA-3-16).
 *
 * - whatsapp_envios: tudo que o SISTEMA manda pela API oficial. Estados da
 *   RN-69: pendente → enviado | fora_da_janela_sem_modelo | sem_numero | erro |
 *   erro_definitivo. `dedupe_key` UNIQUE impede o mesmo aviso duas vezes
 *   (segunda transferência para o mesmo vendedor não reenvia).
 * - whatsapp_transferencias: PEDIDO de transferência. Quem executa é o hook
 *   onRecordAfterCreateSuccess (RN-67), para produção e simulação usarem o
 *   mesmo código — a lição do projeto.
 *
 * Regras de API nulas nas duas: acesso só pelas rotas.
 * Campos como PLAIN OBJECTS (lição reincidente 06/10 e 08/10).
 */

migrate(
  (app) => {
    // ---------- whatsapp_envios ----------
    try {
      app.findCollectionByNameOrId('whatsapp_envios')
    } catch (_) {
      const colEnv = new Collection({
        name: 'whatsapp_envios',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'lead', type: 'text', max: 40 },
          { name: 'conexao', type: 'text', max: 40 },
          { name: 'destino_telefone', type: 'text', max: 20 },
          {
            name: 'motivo',
            type: 'select',
            maxSelect: 1,
            values: ['ia_resposta', 'ia_followup', 'aviso_vendedor', 'aviso_cliente', 'teste'],
          },
          { name: 'modo', type: 'select', maxSelect: 1, values: ['texto', 'modelo'] },
          { name: 'modelo_nome', type: 'text', max: 80 },
          { name: 'variaveis', type: 'json', maxSize: 20000 },
          { name: 'texto', type: 'text', max: 4000 },
          {
            name: 'estado',
            type: 'select',
            maxSelect: 1,
            values: [
              'pendente',
              'enviado',
              'fora_da_janela_sem_modelo',
              'sem_numero',
              'erro',
              'erro_definitivo',
            ],
          },
          { name: 'tentativas', type: 'number' },
          { name: 'ultimo_erro', type: 'text', max: 60 },
          { name: 'wa_message_id', type: 'text', max: 120 },
          { name: 'dedupe_key', type: 'text', max: 160 },
          { name: 'turno', type: 'text', max: 40 },
          { name: 'criado_por', type: 'text', max: 40 },
          { name: 'enviado_em', type: 'date' },
          { name: 'fixture', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_wa_env_dedupe ON whatsapp_envios (dedupe_key)',
          'CREATE INDEX idx_wa_env_estado ON whatsapp_envios (estado)',
          'CREATE INDEX idx_wa_env_lead ON whatsapp_envios (lead)',
        ],
      })
      app.save(colEnv)
    }

    // ---------- whatsapp_transferencias ----------
    try {
      app.findCollectionByNameOrId('whatsapp_transferencias')
    } catch (_) {
      const colTr = new Collection({
        name: 'whatsapp_transferencias',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'lead', type: 'text', max: 40 },
          { name: 'origem_pedido', type: 'select', maxSelect: 1, values: ['botao', 'ia'] },
          {
            name: 'motivo',
            type: 'select',
            maxSelect: 1,
            values: [
              'primeiro_contato',
              'ja_cliente',
              'pediu_humano',
              'humor_negativo',
              'fora_do_roteiro',
              'falha_ia',
              'manutencao',
            ],
          },
          { name: 'simulacao', type: 'bool' },
          { name: 'vendedor_user', type: 'text', max: 40 },
          { name: 'vendedor_nome', type: 'text', max: 200 },
          {
            name: 'regra',
            type: 'select',
            maxSelect: 1,
            values: ['carteira', 'rodizio', 'manutencao'],
          },
          { name: 'envios', type: 'json', maxSize: 20000 },
          {
            name: 'estado',
            type: 'select',
            maxSelect: 1,
            values: ['pendente', 'concluida', 'sem_numero', 'erro'],
          },
          { name: 'detalhe', type: 'text', max: 200 },
          { name: 'criado_por', type: 'text', max: 40 },
          { name: 'fixture', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE INDEX idx_wa_tr_lead ON whatsapp_transferencias (lead)',
          'CREATE INDEX idx_wa_tr_estado ON whatsapp_transferencias (estado)',
        ],
      })
      app.save(colTr)
    }

    const c1 = app.findCollectionByNameOrId('whatsapp_envios')
    const c2 = app.findCollectionByNameOrId('whatsapp_transferencias')
    console.log('0072: envios=' + c1.fields.length + ' transferencias=' + c2.fields.length)
  },
  (app) => {
    for (const nome of ['whatsapp_transferencias', 'whatsapp_envios']) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (e) {}
    }
    console.log('0072 revertida')
  },
)
