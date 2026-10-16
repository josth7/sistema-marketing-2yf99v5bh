/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0033 — índice UNIQUE da inbox vira PARCIAL (card a434ca96).
 *
 * Prova (v0.0.144): UNIQUE(report_id, user_id) com report_id='' trata dois
 * lembretes do MESMO usuário como duplicatas ("Value must be unique") — o
 * SQLite não distingue '' de NULL no índice composto. O dedupe REAL do lembrete
 * é a dedupe_key (decision+revision+data+user, consultada pela rota antes de
 * gravar); o índice do relatório (report_id+user_id) só vale quando report_id
 * não é vazio → índice PARCIAL com WHERE report_id != ''.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('inbox_items')
    // remover o índice antigo (nome da 0018) e criar o parcial
    try {
      col.indexes = col.indexes.filter(function (ix) {
        return ix.indexOf('idx_inbox_unica') < 0
      })
      col.indexes.push(
        "CREATE UNIQUE INDEX IF NOT EXISTS idx_inbox_unica_rel ON inbox_items (report_id, user_id) WHERE report_id != ''",
      )
      app.save(col)
      console.log('migração 0033 aplicada: índice UNIQUE parcial (lembretes não colidem)')
    } catch (eI) {
      console.log('migração 0033: índice não alterado — ' + String(eI).slice(0, 120))
    }
  },
  (app) => {
    console.log('migração 0033 revertida (índice parcial não é removido)')
  },
)
