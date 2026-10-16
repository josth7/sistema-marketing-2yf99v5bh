/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0032 — report_id SEM required em inbox_items (card a434ca96).
 *
 * A 0030 (v0.0.141) adicionou tipo/decision_id/dedupe_key, mas a correção do
 * report_id.required foi editada DENTRO da 0030 — migração já aplicada não
 * re-executa (AP-2026-10-16). Esta migração nova faz o remove+add:
 * mutação direta de required não persiste (prova v0.0.142 — erro
 * "report_id: cannot be blank" ao gravar lembrete sem relatório).
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('inbox_items')
    let precisa = false
    try {
      const f = col.fields.getByName('report_id')
      precisa = !!(f && f.required)
    } catch (e) {}
    if (!precisa) {
      console.log('migração 0032: report_id já sem required — nada a fazer')
      return
    }
    col.fields.removeByName('report_id')
    col.fields.add(new TextField({ name: 'report_id', max: 30 }))
    app.save(col)
    console.log('migração 0032 aplicada: report_id sem required (lembrete sem relatório)')
  },
  (app) => {
    console.log('migração 0032 revertida (required não é restaurado)')
  },
)
