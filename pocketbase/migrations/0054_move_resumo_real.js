/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0054 (v2) — move o resumo REAL (aguardando_revisao da quinzena 1–15/10)
 * para o relatório da cadeia REAL (mno971mpa2p1r0m rev 8) e RECRIA os itens de
 * revisão da caixa dos revisores (apaga os antigos antes de inserir — idempotente).
 */
migrate(
  (app) => {
    const colS = app.findCollectionByNameOrId('report_ai_summaries')
    const colI = app.findCollectionByNameOrId('inbox_items')
    const alvo = 'mno971mpa2p1r0m' // rev 8, cadeia real
    const sums = app.findRecordsByFilter(colS, "estado='aguardando_revisao'", '-created', 50, 0)
    for (const s of sums) {
      const rasc = String(s.get('rascunho') || '')
      if (rasc.indexOf('Resumo factual da quinzena 1–15/10') !== 0) continue
      const atual = String(s.get('report_id') || '')
      if (atual === alvo) {
        console.log('migração 0054: resumo já está no alvo')
        continue
      }
      // usuários dos itens de revisão atuais deste resumo
      const itensAntigos = app.findRecordsByFilter(colI, "dedupe_key~'" + s.id + "+'", '', 50, 0)
      const usuarios = []
      for (const it of itensAntigos) {
        const uid = String(it.get('user_id') || '')
        if (uid && usuarios.indexOf(uid) < 0) usuarios.push(uid)
        app.delete(it)
      }
      // mover o resumo
      s.set('report_id', alvo)
      app.save(s)
      console.log('migração 0054: resumo real ' + s.id + ' → ' + alvo)
      // recriar os itens no alvo
      for (const uid of usuarios) {
        const dk = s.id + '+' + uid
        let existe = null
        try {
          existe = app.findFirstRecordByData(colI, 'dedupe_key', dk)
        } catch (eF) {
          existe = null
        }
        if (existe) continue
        const novo = new Record(colI)
        novo.set('report_id', alvo)
        novo.set('user_id', uid)
        novo.set('scope', 'revisao_resumo')
        novo.set('status', 'pending')
        novo.set('dedupe_key', dk)
        app.save(novo)
        console.log('migração 0054: item recriado p/ ' + uid)
      }
    }
  },
  (app) => {
    console.log('migração 0054 revertida: vínculos permanecem')
  },
)
