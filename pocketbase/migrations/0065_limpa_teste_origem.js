/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0065 — remove o lead de teste da prova de causa raiz (28/10).
 * Lead "ZZ Teste Origem Organico" (5511999990001) criado para provar que a rota
 * de importação passou a aceitar `origem=organico` depois da correção da
 * segunda lista ORIGENS. Sai do banco para não sujar a base real.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('crm_leads')
    let apagados = 0
    try {
      const r = app.findRecordsByFilter(col, "telefone='5511999990001'", '', 5, 0)
      for (const reg of r) {
        try {
          app.delete(reg)
          apagados++
        } catch (eD) {}
      }
    } catch (e) {}
    console.log('0065: leads de teste removidos = ' + apagados)
  },
  (app) => {},
)
