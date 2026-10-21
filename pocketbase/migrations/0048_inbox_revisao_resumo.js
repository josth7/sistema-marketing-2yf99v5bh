/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0048 — SPEC-3-003 card 1: inbox_items.tipo ganha a opção revisao_resumo.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('inbox_items')
    for (const f of col.fields) {
      if (String(f.name) === 'tipo' && String(f.type) === 'select') {
        const valores = f.values || []
        if (valores.indexOf('revisao_resumo') < 0) {
          valores.push('revisao_resumo')
          f.values = valores
          app.save(col)
          console.log('migração 0048: tipo revisao_resumo adicionado ao inbox')
          return
        }
        console.log('migração 0048: revisao_resumo já existe no select')
        return
      }
    }
    console.log('migração 0048: campo tipo não encontrado')
  },
  (app) => {
    console.log('migração 0048 revertida: select permanece')
  },
)
