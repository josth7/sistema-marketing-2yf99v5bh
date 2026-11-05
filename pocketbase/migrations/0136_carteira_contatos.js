/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0136 — carteira de contatos (CA-3-58, SPEC-3-013, 05/11).
 *
 * **O problema:** quando um vendedor conecta o número, o WhatsApp manda o
 * histórico de contatos (`history_sync`). Hoje o código **registra e joga
 * fora** — então a carteira dele no CRM nasce vazia, mesmo ele tendo centenas
 * de clientes no celular.
 *
 * **O que esta migração cria:** `carteira_contatos`, a lista de contatos que
 * cada vendedor já conhece. Dela sai a regra "quem é da carteira do vendedor X
 * e escreve para a central fala com X, sem rodízio".
 *
 * **Privacidade (RN do CA-3-58):** grava SÓ telefone e nome. Nenhum texto de
 * mensagem, nenhum conteúdo. O histórico serve para saber *com quem* o
 * vendedor já falou, não *o que* foi dito.
 */
migrate(
  (app) => {
    var existe = null
    try {
      existe = app.findCollectionByNameOrId('carteira_contatos')
    } catch (e0) {}

    if (!existe) {
      const col = new Collection({
        name: 'carteira_contatos',
        type: 'base',
        fields: [
          { name: 'telefone', type: 'text' },
          { name: 'nome', type: 'text' },
          { name: 'conexao', type: 'text' },
          { name: 'vendedor_user', type: 'text' },
          { name: 'origem_carteira', type: 'text' },
          { name: 'lote', type: 'text' },
          { name: 'fixture', type: 'bool' },
          { name: 'dedupe_key', type: 'text' },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_carteira_dedupe ON carteira_contatos (dedupe_key)'],
      })
      app.save(col)
      console.log('0136: colecao carteira_contatos criada')
    } else {
      console.log('0136: colecao ja existia')
    }

    // ---------- histórico bruto (marcador de fixture) ----------
    // A SPEC exige que o marcador de texto da fixture NÃO apareça em lugar
    // nenhum: nem na carteira, nem no bruto, nem nos eventos, nem no log.
    var existeBruto = null
    try {
      existeBruto = app.findCollectionByNameOrId('whatsapp_historico_bruto')
    } catch (e1) {}
    if (!existeBruto) {
      try {
        const colB = new Collection({
          name: 'whatsapp_historico_bruto',
          type: 'base',
          fields: [
            { name: 'conexao', type: 'text' },
            { name: 'tipo_evento', type: 'text' },
            { name: 'quantidade', type: 'number' },
            { name: 'guardado_em', type: 'date' },
            { name: 'fixture', type: 'bool' },
          ],
        })
        app.save(colB)
        console.log('0136: colecao whatsapp_historico_bruto criada')
      } catch (e2) {
        console.log('0136: falhou historico_bruto -> ' + String(e2).slice(0, 140))
      }
    }

    console.log('0136: pronto')
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('carteira_contatos'))
    } catch (e) {}
  },
)
