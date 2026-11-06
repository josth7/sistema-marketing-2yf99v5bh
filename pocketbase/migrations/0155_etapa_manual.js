/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0155 — marca de mudança manual da etapa (CA-3-63, 06/11).
 *
 * **O problema:** o vendedor muda a etapa do lead no funil e o robô, na
 * mensagem seguinte, devolve para a etapa que ele calculou. O vendedor perde a
 * confiança no funil e volta a trabalhar por fora.
 *
 * **A regra:** depois de uma mudança MANUAL, a automação não mexe mais na etapa
 * daquele lead. Decisão humana vale mais que robô.
 *
 * Campos:
 *   - `etapa_manual_em`: quando a pessoa mudou à mão;
 *   - `etapa_manual_por`: quem mudou.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('crm_leads')
    const nomes = []
    try {
      for (const f of col.fields || []) nomes.push(String(f.name))
    } catch (e0) {}

    if (nomes.indexOf('etapa_manual_em') < 0) {
      try {
        col.fields.add(new DateField({ name: 'etapa_manual_em' }))
        console.log('0155: etapa_manual_em criado')
      } catch (e1) {}
    }
    if (nomes.indexOf('etapa_manual_por') < 0) {
      try {
        col.fields.add(new TextField({ name: 'etapa_manual_por', max: 40 }))
        console.log('0155: etapa_manual_por criado')
      } catch (e2) {}
    }
    try {
      app.save(col)
      console.log('0155: pronto')
    } catch (e3) {
      console.log('0155: falhou -> ' + String(e3).slice(0, 150))
    }
  },
  (app) => {
    console.log('0155 revertida (campos permanecem)')
  },
)
