/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0053 — realinha o resumo real ao relatório mais recente da quinzena
 * 1–15/10 (as republicações administrativas criaram revisões novas sem resumo;
 * o resumo pertence à quinzena). Idempotente.
 */
migrate(
  (app) => {
    const colS = app.findCollectionByNameOrId('report_ai_summaries')
    const colR = app.findCollectionByNameOrId('reports')
    const sums = app.findRecordsByFilter(colS, "estado='aguardando_revisao'", '', 50, 0)
    let realinhados = 0
    for (const s of sums) {
      const rid = String(s.get('report_id') || '')
      if (!rid) continue
      let rep = null
      try {
        rep = app.findRecordById(colR, rid)
      } catch (eR) {
        continue
      }
      // achar o relatório MAIS RECENTE da mesma quinzena+scope
      const filtro =
        "period_start='" +
        rep.get('period_start') +
        "' && period_end='" +
        rep.get('period_end') +
        "' && scope='" +
        String(rep.get('scope') || '').replace(/'/g, '') +
        "'"
      const todos = app.findRecordsByFilter(colR, filtro, '-report_revision', 1, 0)
      if (!todos || todos.length === 0) continue
      const maisRecente = todos[0]
      if (maisRecente.id === rid) continue
      // já existe resumo no mais recente? não mover (único por relatório+evento)
      const ex = app.findRecordsByFilter(colS, "report_id='" + maisRecente.id + "'", '', 1, 0)
      if (ex && ex.length > 0) continue
      s.set('report_id', maisRecente.id)
      app.save(s)
      realinhados++
      console.log('migração 0053: resumo ' + s.id + ' → ' + maisRecente.id)
    }
    console.log('migração 0053: ' + realinhados + ' resumo(s) realinhado(s)')
  },
  (app) => {
    console.log('migração 0053 revertida: vínculos permanecem')
  },
)
