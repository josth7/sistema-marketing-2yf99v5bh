/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0024 — garante o campo read_at em inbox_items (card a70d5ab8).
 *
 * Prova do defeito: PATCH /inbox/{id}/read respondeu 200 três vezes e o item
 * continuou "Não lido" na caixa — set() em campo inexistente é descartado
 * silenciosamente pelo PocketBase e o save() retorna 200 igual.
 * Correção: adiciona o campo com construtor tipado (AP-2026-10-07-1420).
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('inbox_items')
    let existe = false
    try {
      const f = col.fields.getByName('read_at')
      if (f) existe = true
    } catch (e) {}
    if (existe) {
      console.log('migração 0024: read_at já existe — nada a fazer')
      return
    }
    col.fields.add(new DateField({ name: 'read_at' }))
    app.save(col)
    console.log('migração 0024 aplicada: campo read_at adicionado a inbox_items')
  },
  (app) => {
    console.log('migração 0024 revertida (read_at não é removido — correção de schema)')
  },
)
