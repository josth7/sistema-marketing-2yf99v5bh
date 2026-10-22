/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0054 — move o resumo REAL (aguardando_revisao da quinzena 1–15/10)
 * para o relatório da cadeia REAL (9ot2po7mzsg8gqg → ... → mno971mpa2p1r0m rev 8,
 * scope sem 'fixture') e realinha os itens de revisão da caixa dos revisores.
 */
migrate(
  (app) => {
    const colS = app.findCollectionByNameOrId('report_ai_summaries')
    const colR = app.findCollectionByNameOrId('reports')
    const colI = app.findCollectionByNameOrId('inbox_items')
    const alvo = 'mno971mpa2p1r0m' // rev 8, cadeia real
    // resumo real: o aguardando cujo rascunho começa com "Resumo factual da quinzena 1–15/10"
    const sums = app.findRecordsByFilter(colS, "estado='aguardando_revisao'", '-created', 50, 0)
    for (const s of sums) {
      const rasc = String(s.get('rascunho') || '')
      if (rasc.indexOf('Resumo factual da quinzena 1–15/10') !== 0) continue
      const atual = String(s.get('report_id') || '')
      if (atual === alvo) continue
      // limpar resumo duplicado no alvo (não deve haver)
      const ex = app.findRecordsByFilter(colS, "report_id='" + alvo + "'", '', 10, 0)
      for (const e2 of ex) {
        if (e2.id !== s.id) {
          app.delete(e2)
          console.log('migração 0054: resumo duplicado removido ' + e2.id)
        }
      }
      s.set('report_id', alvo)
      app.save(s)
      console.log('migração 0054: resumo real ' + s.id + ' → ' + alvo)
      // realinhar os itens de revisão (scope=revisao_resumo) da quinzena
      const itens = app.findRecordsByFilter(
        colI,
        "scope='revisao_resumo' && report_id!='" + alvo + "'",
        '',
        50,
        0,
      )
      for (const it of itens) {
        const dk = String(it.get('dedupe_key') || '')
        if (dk.indexOf(s.id + '+') !== 0) continue // só itens deste resumo
        it.set('report_id', alvo)
        it.set('dedupe_key', s.id + '+' + String(it.get('user_id') || ''))
        app.save(it)
        console.log('migração 0054: item de revisão ' + it.id + ' → ' + alvo)
      }
    }
  },
  (app) => {
    console.log('migração 0054 revertida: vínculos permanecem')
  },
)
