/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0044 — SPEC-3-002 card 2 (RN-17): decisions ganha o campo opcional
 * source_analysis_id (rel analyses) — "Registrar decisão" a partir da análise.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('decisions')
    let tem = false
    for (const f of col.fields) {
      if (String(f.name) === 'source_analysis_id') tem = true
    }
    if (tem) {
      console.log('migração 0044: source_analysis_id já existe')
      return
    }
    col.fields.add(
      new Field({
        name: 'source_analysis_id',
        type: 'relation',
        collectionId: app.findCollectionByNameOrId('analyses').id,
        maxSelect: 1,
        required: false,
      }),
    )
    app.save(col)
    console.log('migração 0044: source_analysis_id criado em decisions')
  },
  (app) => {
    console.log('migração 0044 revertida: campo permanece (rollback não remove dados)')
  },
)
