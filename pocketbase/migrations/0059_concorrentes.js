/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0059 — monitoração de concorrentes (fase 4, card 4).
 *
 * Coleção concorrentes_obs: observações manuais (sem scraping no 1º momento —
 * desenho aprovado no briefing da fase 4). Cada registro: concorrente (nome
 * livre — catálogo dos 5 no frontend), data, tipo (preco/lançamento/promocao/
 * produto/outro), texto, canal onde viu (site/instagram/whatsapp/loja/outro),
 * fixture.
 */

migrate(
  (app) => {
    let col
    try {
      col = app.findCollectionByNameOrId('concorrentes_obs')
    } catch (_) {
      col = new Collection({
        name: 'concorrentes_obs',
        type: 'base',
        listRule: '',
        viewRule: '',
        createRule: '',
        updateRule: '',
        deleteRule: '',
        fields: [
          { name: 'concorrente', type: 'text', required: true, max: 120 },
          { name: 'data_obs', type: 'date' },
          {
            name: 'tipo',
            type: 'select',
            maxSelect: 1,
            values: ['preco', 'lancamento', 'promocao', 'produto', 'outro'],
          },
          { name: 'texto', type: 'text', max: 2000 },
          { name: 'canal_visto', type: 'text', max: 80 },
          { name: 'user_id', type: 'text', max: 40 },
          { name: 'fixture', type: 'bool' },
        ],
        indexes: ['CREATE INDEX idx_conc_nome ON concorrentes_obs (concorrente)'],
      })
      app.save(col)
    }
    const c = app.findCollectionByNameOrId('concorrentes_obs')
    console.log('0059: concorrentes_obs campos=' + c.fields.length)
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('concorrentes_obs'))
    } catch (_) {}
  },
)
