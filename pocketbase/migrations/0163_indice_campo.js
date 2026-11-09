/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0163 — campo para guardar o índice dos repetidos (09/11).
 *
 * O índice precisa de um campo de texto longo. `diag_cron_sonda.quando` é
 * campo DATE (não texto) e não aceita o conteúdo — foi por isso que a leitura
 * voltou zero mesmo após gravar.
 *
 * Cria `indice` em `diag_cron_sonda`, usado só por esta rotina técnica.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('diag_cron_sonda')
    const nomes = []
    try {
      for (const f of col.fields || []) nomes.push(String(f.name))
    } catch (e0) {}
    if (nomes.indexOf('indice') < 0) {
      try {
        col.fields.add(new TextField({ name: 'indice', max: 5000000 }))
        console.log('0163: campo indice criado')
      } catch (e1) {
        console.log('0163: falhou -> ' + String(e1).slice(0, 140))
      }
      try {
        app.save(col)
      } catch (e2) {}
    } else {
      console.log('0163: campo indice ja existia')
    }
  },
  (app) => {
    console.log('0163 revertida (campo permanece)')
  },
)
