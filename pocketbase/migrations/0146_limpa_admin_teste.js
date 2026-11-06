/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0146 — limpa as versões de teste da Administração (06/11).
 *
 * A prova do CA-3-48 criou as versões 2 e 3 (salvar e voltar). Elas não
 * representam decisão da gestão: são teste. Fica só a versão 1, que é o estado
 * real de entrega (avisos e resumo DESLIGADOS).
 */
migrate(
  (app) => {
    var removidas = 0
    try {
      const col = app.findCollectionByNameOrId('admin_config')
      const vs = app.findRecordsByFilter(col, '', '', 200, 0)
      for (const v of vs) {
        if (Number(v.get('versao') || 0) <= 1) continue
        try {
          app.delete(v)
          removidas++
        } catch (e1) {}
      }
    } catch (e0) {}
    console.log('0146: versoes de teste removidas = ' + removidas)
  },
  (app) => {
    console.log('0146 revertida')
  },
)
