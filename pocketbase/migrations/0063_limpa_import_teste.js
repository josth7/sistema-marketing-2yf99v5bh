/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0063 — limpeza dos leads de teste da importação (28/10).
 * Os 3 primeiros leads entraram pela versão ANTIGA da rota: telefone cru
 * ("558899898584@s.whatsapp.net") e sem vendedor/etapa. Saem aqui para serem
 * reimportados corretamente (o dedupe compara telefone normalizado e não
 * reconheceria o formato cru).
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('crm_leads')
    let apagados = 0
    try {
      const ruins = app.findRecordsByFilter(col, "telefone ~ '@'", '', 100, 0)
      for (const r of ruins) {
        try {
          app.delete(r)
          apagados++
        } catch (eD) {}
      }
    } catch (e) {
      console.log('0063: filtro falhou: ' + e)
    }
    console.log('0063: leads com telefone cru apagados = ' + apagados)
  },
  (app) => {},
)
