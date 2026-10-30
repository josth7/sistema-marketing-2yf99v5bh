/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0092 — Conversas 2.0: mídia de saída e observação interna (30/10).
 *
 * Pedido do dono: o vendedor responder pelo sistema (texto, foto, áudio, vídeo)
 * e a gestão deixar uma observação que SÓ o vendedor daquela conversa lê.
 *
 * Três peças:
 *
 * 1. `whatsapp_midia` — arquivo enviado pelo vendedor. Precisa de URL que a
 *    D-API consiga buscar (ela aceita URL pública ou base64). O registro tem id
 *    aleatório de 15 caracteres e a viewRule é aberta: quem tem o link vê o
 *    arquivo, e o link só é conhecido por quem enviou. listRule fica TRAVADA
 *    (ninguém lista a coleção). É o mesmo modelo de "link não adivinhável".
 *
 * 2. `whatsapp_observacoes` — a nota interna. Regra de leitura: gestão vê tudo;
 *    vendedor vê só a observação da conversa que é dele. Nunca vai para o
 *    WhatsApp do cliente — é interna por construção.
 *
 * 3. `whatsapp_envios` ganha:
 *    - motivo `vendedor_resposta` / `vendedor_midia` (o webhook usa o motivo
 *      para marcar o autor como `vendedor`, não como `sistema`)
 *    - `midia` (aponta para whatsapp_midia) e `legenda`
 *    - `autor_user` (quem enviou — vira `autor_user` na mensagem)
 *
 * Idempotente: campo/coleção que já existe é mantido.
 */

migrate(
  (app) => {
    // ==================== 1. coleção de mídia ====================
    var colMidia = null
    try {
      colMidia = app.findCollectionByNameOrId('whatsapp_midia')
      console.log('0092: whatsapp_midia já existe')
    } catch (e0) {
      colMidia = new Collection({
        name: 'whatsapp_midia',
        type: 'base',
        // o arquivo precisa ser servido sem login: a D-API busca por URL.
        // O id é aleatório (15 chars), então o link não é adivinhável.
        viewRule: '',
        listRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'arquivo', type: 'file', required: true, maxSelect: 1, maxSize: 26214400 },
          {
            name: 'tipo',
            type: 'select',
            required: false,
            maxSelect: 1,
            values: ['image', 'audio', 'video', 'document'],
          },
          { name: 'mimetype', type: 'text', required: false, max: 120 },
          { name: 'nome_arquivo', type: 'text', required: false, max: 200 },
          { name: 'duracao_s', type: 'number', required: false },
          { name: 'enviado_por', type: 'text', required: false, max: 15 },
          { name: 'conexao', type: 'text', required: false, max: 15 },
          { name: 'lead', type: 'text', required: false, max: 15 },
        ],
      })
      try {
        app.save(colMidia)
        console.log('0092: whatsapp_midia criada')
      } catch (e1) {
        console.log('0092: falhou criar whatsapp_midia -> ' + String(e1).slice(0, 200))
        return
      }
    }

    // ==================== 2. coleção de observações internas ====================
    var colObs = null
    try {
      colObs = app.findCollectionByNameOrId('whatsapp_observacoes')
      console.log('0092: whatsapp_observacoes já existe')
    } catch (e2) {
      colObs = new Collection({
        name: 'whatsapp_observacoes',
        type: 'base',
        // leitura decidida nas rotas (JSVM faz o filtro por vendedor);
        // API direta fica fechada para não vazar observação entre vendedores.
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'conversa', type: 'text', required: false, max: 15 },
          { name: 'lead', type: 'text', required: false, max: 15 },
          { name: 'conexao', type: 'text', required: false, max: 15 },
          { name: 'texto', type: 'text', required: true, max: 2000 },
          { name: 'autor_user', type: 'text', required: false, max: 15 },
          { name: 'autor_nome', type: 'text', required: false, max: 120 },
          // para quem a nota é visível: '' = o vendedor da conversa
          { name: 'para_user', type: 'text', required: false, max: 15 },
          { name: 'lida_em', type: 'date', required: false },
        ],
      })
      try {
        app.save(colObs)
        console.log('0092: whatsapp_observacoes criada')
      } catch (e3) {
        console.log('0092: falhou criar whatsapp_observacoes -> ' + String(e3).slice(0, 200))
      }
    }

    // ==================== 3. campos novos em whatsapp_envios ====================
    var colEnv = null
    try {
      colEnv = app.findCollectionByNameOrId('whatsapp_envios')
    } catch (e4) {
      console.log('0092: whatsapp_envios não encontrada')
      return
    }

    // motivo: acrescenta os dois do vendedor
    var motivo = null
    for (const f of colEnv.fields) {
      if (f.name === 'motivo') motivo = f
    }
    if (motivo) {
      var vals = []
      try {
        vals = motivo.values || []
      } catch (eM) {}
      var novos = ['vendedor_resposta', 'vendedor_midia']
      var mudouMotivo = false
      for (const nv of novos) {
        if (vals.indexOf(nv) < 0) {
          vals.push(nv)
          mudouMotivo = true
        }
      }
      if (mudouMotivo) {
        motivo.values = vals
        try {
          app.save(colEnv)
          console.log('0092: motivos do vendedor acrescentados -> ' + vals.join(','))
        } catch (e5) {
          console.log('0092: falhou motivo -> ' + String(e5).slice(0, 200))
        }
      }
    }

    // campos de mídia/legenda/autor
    var temMidia = false
    var temLegenda = false
    var temAutor = false
    for (const f of colEnv.fields) {
      if (f.name === 'midia') temMidia = true
      if (f.name === 'legenda') temLegenda = true
      if (f.name === 'autor_user') temAutor = true
    }
    if (!temMidia) {
      colEnv.fields.add(new TextField({ name: 'midia', required: false, max: 15 }))
    }
    if (!temLegenda) {
      colEnv.fields.add(new TextField({ name: 'legenda', required: false, max: 2000 }))
    }
    if (!temAutor) {
      colEnv.fields.add(new TextField({ name: 'autor_user', required: false, max: 15 }))
    }
    try {
      app.save(colEnv)
      console.log('0092: campos midia/legenda/autor_user garantidos')
    } catch (e6) {
      console.log('0092: falhou campos envios -> ' + String(e6).slice(0, 200))
    }

    // ==================== 4. o autor_user direto na mensagem ====================
    var colMsg = app.findCollectionByNameOrId('whatsapp_mensagens')
    var temAutorMsg = false
    for (const f of colMsg.fields) {
      if (f.name === 'autor_user') temAutorMsg = true
    }
    if (!temAutorMsg) {
      colMsg.fields.add(new TextField({ name: 'autor_user', required: false, max: 15 }))
      try {
        app.save(colMsg)
        console.log('0092: autor_user acrescentado em whatsapp_mensagens')
      } catch (e7) {
        console.log('0092: falhou autor_user msg -> ' + String(e7).slice(0, 200))
      }
    }

    console.log('0092: Conversas 2.0 pronta no banco')
  },
  (app) => {
    console.log('0092 revertida (coleções preservadas para auditoria)')
  },
)
