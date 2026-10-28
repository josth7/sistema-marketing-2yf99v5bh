/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0076 — campo `fixture_status` na fila de envios (CA-3-16).
 *
 * Por que existe: para provar a classificação da RN-69 (2xx → enviado,
 * 500/429 → 3 tentativas → erro definitivo, 4xx → erro definitivo) o teste não
 * pode depender de rede, URL interna ou segredo — bastava uma dessas peças
 * faltar para o envio cair em `erro_definitivo` sem provar nada.
 *
 * Com este campo, um envio fixture informa o status que a D-API devolveria e a
 * fila aplica a MESMA classificação, de forma determinística. Envio real
 * (fixture=false) continua indo de verdade para a D-API.
 */

migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_envios')
    const nomes = []
    for (const f of col.fields) nomes.push(String(f.name))
    if (nomes.indexOf('fixture_status') < 0) {
      col.fields.add(new NumberField({ name: 'fixture_status', required: false }))
      app.save(col)
      console.log('0076: campo fixture_status criado')
    } else {
      console.log('0076: campo fixture_status já existia')
    }
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('whatsapp_envios')
      col.fields.removeByName('fixture_status')
      app.save(col)
    } catch (e) {}
    console.log('0076 revertida')
  },
)
