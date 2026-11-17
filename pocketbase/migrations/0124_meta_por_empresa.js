/// <reference path="../pb_data/types.d.ts" />

/**
 * 0124 — META POR EMPRESA (17/11).
 *
 * O card de 11/11 foi fechado sem isto: a leitura da Meta usava segredos de
 * NOME FIXO (META_ACCESS_TOKEN / META_ACCOUNT_ID), então só uma empresa podia
 * ter conta Meta. Aqui a empresa passa a GUARDAR O NOME do segredo dela —
 * assim cada uma aponta para o próprio token e a própria conta, sem que uma
 * sobrescreva a outra.
 *
 * Os hooks (ingestao.js e meta_ingestao_diaria.js) já foram ajustados para ler
 * nesta ordem: nome guardado na empresa -> nome fixo antigo -> erro claro.
 *
 * Campos criados em `empresas`:
 *   meta_token_segredo  — nome do segredo que guarda o token (ex.: META_TOKEN_GOO7)
 *   meta_conta_segredo  — nome do segredo que guarda o act_id (ex.: META_CONTA_GOO7)
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('empresas')

    // idempotente: só cria o que ainda não existe
    var temToken = false
    var temConta = false
    try {
      for (const f of col.fields) {
        if (String(f.name) === 'meta_token_segredo') temToken = true
        if (String(f.name) === 'meta_conta_segredo') temConta = true
      }
    } catch (e0) {}

    if (!temToken) {
      col.fields.add(new TextField({ name: 'meta_token_segredo', required: false, max: 120 }))
    }
    if (!temConta) {
      col.fields.add(new TextField({ name: 'meta_conta_segredo', required: false, max: 120 }))
    }
    app.save(col)

    // Marca na Haisan que ela segue nos nomes fixos antigos — assim fica
    // explícito de onde vem o segredo dela, em vez de "sorte de fallback".
    try {
      const es = app.findRecordsByFilter('empresas', "apelido='Haisan'", '', 1, 0)
      if (es.length > 0) {
        const hai = es[0]
        if (String(hai.get('meta_token_segredo') || '') === '') {
          hai.set('meta_token_segredo', 'META_ACCESS_TOKEN')
        }
        if (String(hai.get('meta_conta_segredo') || '') === '') {
          hai.set('meta_conta_segredo', 'META_ACCOUNT_ID')
        }
        app.save(hai)
      }
    } catch (e1) {
      console.log('0124: nao marquei a Haisan -> ' + String(e1).slice(0, 120))
    }
  },
  (app) => {
    // rollback: remove os dois campos
    try {
      const col = app.findCollectionByNameOrId('empresas')
      col.fields.removeByName('meta_token_segredo')
      col.fields.removeByName('meta_conta_segredo')
      app.save(col)
    } catch (e2) {}
  },
)
