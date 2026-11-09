/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0162 — remove a conexão de teste do CA-3-97 (09/11).
 *
 * A prova ligou/desligou a apresentação numa conexão de teste. Ela sai para não
 * aparecer em tela nem contar em relatório. Os vendedores reais nunca foram
 * tocados (a apresentação deles segue desligada, como estava).
 */
migrate(
  (app) => {
    var n = 0
    try {
      const col = app.findCollectionByNameOrId('whatsapp_conexoes')
      const a = app.findRecordsByFilter(col, "session_id='prova-apres-ca397'", '', 5, 0)
      for (const x of a) {
        try {
          app.delete(x)
          n++
        } catch (e1) {}
      }
    } catch (e0) {}
    console.log('0162: conexoes de prova removidas = ' + n)
  },
  (app) => {
    console.log('0162 revertida')
  },
)
