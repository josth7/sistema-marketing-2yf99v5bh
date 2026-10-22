/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0054 (v3) — move o resumo REAL (aguardando_revisao da quinzena 1–15/10)
 * de volta para o relatório 6jtargnnj4ftj2c (rev 4), que é o report_id dos itens
 * de revisão na caixa dos revisores. Não toca nos itens (o índice UNIQUE
 * (report_id, user_id) do inbox impede duplicar item de revisão com item de
 * relatório do mesmo par).
 */
migrate(
  (app) => {
    const colS = app.findCollectionByNameOrId('report_ai_summaries')
    const alvo = '6jtargnnj4ftj2c'
    const sums = app.findRecordsByFilter(colS, "estado='aguardando_revisao'", '-created', 50, 0)
    for (const s of sums) {
      const rasc = String(s.get('rascunho') || '')
      if (rasc.indexOf('Resumo factual da quinzena 1–15/10') !== 0) continue
      const atual = String(s.get('report_id') || '')
      if (atual === alvo) {
        console.log('migração 0054: resumo já está no alvo')
        continue
      }
      s.set('report_id', alvo)
      app.save(s)
      console.log('migração 0054: resumo real ' + s.id + ' → ' + alvo)
    }
  },
  (app) => {
    console.log('migração 0054 revertida: vínculos permanecem')
  },
)
