/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0066 — WhatsApp oficial (SPEC-3-005, cards 1 e 2).
 *
 * Coleções (todas com regras de API nulas: acesso só pelas rotas):
 * - whatsapp_conexoes: os números da Haisan (1 central + 4 vendedores).
 *   Guarda só o NOME do segredo da chave, nunca a chave.
 * - whatsapp_mensagens: cada mensagem, ligada ao lead pelo telefone.
 *   UNIQUE(conexao, wa_message_id) = a mesma mensagem nunca entra duas vezes.
 * - whatsapp_eventos: log técnico SEM telefone, nome ou texto (privacidade).
 *
 * Campos como PLAIN OBJECTS (lição reincidente 08/10).
 */

migrate(
  (app) => {
    // ---------- whatsapp_conexoes ----------
    let colConexoes
    try {
      colConexoes = app.findCollectionByNameOrId('whatsapp_conexoes')
    } catch (_) {
      colConexoes = new Collection({
        name: 'whatsapp_conexoes',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'papel', type: 'select', maxSelect: 1, values: ['central', 'vendedor'] },
          { name: 'numero', type: 'text', max: 20 },
          { name: 'nome_exibicao', type: 'text', max: 120 },
          { name: 'vendedor_user', type: 'text', max: 40 },
          { name: 'vendedor_nome_publico', type: 'text', max: 120 },
          { name: 'session_id', type: 'text', max: 80 },
          { name: 'ativo', type: 'bool' },
          { name: 'nome_segredo_chave', type: 'text', max: 60 },
          { name: 'modelo_aviso_vendedor', type: 'text', max: 120 },
          { name: 'modelo_transferencia_cliente', type: 'text', max: 120 },
          { name: 'guardar_historico', type: 'bool' },
          { name: 'ultimo_evento_em', type: 'date' },
          { name: 'ultimo_status_conexao', type: 'text', max: 40 },
          { name: 'ultimo_status_em', type: 'date' },
          { name: 'recusas_token', type: 'number' },
          { name: 'fixture', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          "CREATE UNIQUE INDEX idx_wa_conexoes_session ON whatsapp_conexoes (session_id) WHERE session_id != ''",
          "CREATE UNIQUE INDEX idx_wa_conexoes_numero ON whatsapp_conexoes (numero) WHERE numero != ''",
          'CREATE INDEX idx_wa_conexoes_papel ON whatsapp_conexoes (papel)',
        ],
      })
      app.save(colConexoes)
    }

    // ---------- whatsapp_mensagens ----------
    let colMensagens
    try {
      colMensagens = app.findCollectionByNameOrId('whatsapp_mensagens')
    } catch (_) {
      colMensagens = new Collection({
        name: 'whatsapp_mensagens',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'conexao', type: 'text', max: 40 },
          { name: 'wa_message_id', type: 'text', max: 120 },
          { name: 'lead', type: 'text', max: 40 },
          { name: 'vinculo', type: 'select', maxSelect: 1, values: ['ok', 'sem_telefone'] },
          { name: 'contato_telefone', type: 'text', max: 20 },
          { name: 'contato_lid', type: 'text', max: 80 },
          { name: 'contato_nome', type: 'text', max: 200 },
          { name: 'direcao', type: 'select', maxSelect: 1, values: ['entrada', 'saida'] },
          {
            name: 'autor',
            type: 'select',
            maxSelect: 1,
            values: ['cliente', 'ia', 'vendedor', 'equipe_central', 'sistema', 'api_externa'],
          },
          { name: 'autor_user', type: 'text', max: 40 },
          {
            name: 'evento_origem',
            type: 'select',
            maxSelect: 1,
            values: ['messages.received', 'messages.sent'],
          },
          { name: 'tipo', type: 'text', max: 40 },
          { name: 'texto', type: 'text', max: 10000 },
          { name: 'media_url', type: 'text', max: 500 },
          { name: 'media_url_temporaria', type: 'bool' },
          { name: 'media_mimetype', type: 'text', max: 120 },
          { name: 'media_duracao_s', type: 'number' },
          { name: 'media_ptt', type: 'bool' },
          { name: 'media_nome_arquivo', type: 'text', max: 300 },
          { name: 'anuncio_ref', type: 'json', maxSize: 20000 },
          { name: 'enviada_em', type: 'date' },
          { name: 'recebida_em', type: 'date' },
          {
            name: 'status',
            type: 'select',
            maxSelect: 1,
            values: ['recebida', 'enviada', 'entregue', 'lida'],
          },
          { name: 'status_em', type: 'date' },
          { name: 'texto_original', type: 'text', max: 10000 },
          { name: 'editada_em', type: 'date' },
          { name: 'apagada_em', type: 'date' },
          { name: 'envio', type: 'text', max: 40 },
          { name: 'trace_id', type: 'text', max: 120 },
          { name: 'fixture', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_wa_msg_unica ON whatsapp_mensagens (conexao, wa_message_id)',
          'CREATE INDEX idx_wa_msg_lead ON whatsapp_mensagens (lead)',
          'CREATE INDEX idx_wa_msg_telefone ON whatsapp_mensagens (contato_telefone)',
          'CREATE INDEX idx_wa_msg_recebida ON whatsapp_mensagens (recebida_em)',
        ],
      })
      app.save(colMensagens)
    }

    // ---------- whatsapp_eventos ----------
    let colEventos
    try {
      colEventos = app.findCollectionByNameOrId('whatsapp_eventos')
    } catch (_) {
      colEventos = new Collection({
        name: 'whatsapp_eventos',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'dedupe_key', type: 'text', max: 200 },
          { name: 'evento', type: 'text', max: 60 },
          { name: 'session_id', type: 'text', max: 80 },
          { name: 'ref_id', type: 'text', max: 120 },
          { name: 'resultado', type: 'text', max: 40 },
          { name: 'codigo_erro', type: 'text', max: 60 },
          { name: 'status_pendente', type: 'bool' },
          { name: 'trace_id', type: 'text', max: 120 },
          { name: 'duracao_ms', type: 'number' },
          { name: 'recebido_em', type: 'date' },
          { name: 'fixture', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX idx_wa_ev_dedupe ON whatsapp_eventos (dedupe_key)',
          'CREATE INDEX idx_wa_ev_session ON whatsapp_eventos (session_id)',
        ],
      })
      app.save(colEventos)
    }

    // conferência pós-criação (lição: conferir schema depois de criar)
    const c1 = app.findCollectionByNameOrId('whatsapp_conexoes')
    const c2 = app.findCollectionByNameOrId('whatsapp_mensagens')
    const c3 = app.findCollectionByNameOrId('whatsapp_eventos')
    console.log(
      '0066: conexoes=' +
        c1.fields.length +
        ' mensagens=' +
        c2.fields.length +
        ' eventos=' +
        c3.fields.length,
    )
  },
  (app) => {
    for (const nome of ['whatsapp_eventos', 'whatsapp_mensagens', 'whatsapp_conexoes']) {
      try {
        app.delete(app.findCollectionByNameOrId(nome))
      } catch (e) {}
    }
    console.log('0066 revertida')
  },
)
