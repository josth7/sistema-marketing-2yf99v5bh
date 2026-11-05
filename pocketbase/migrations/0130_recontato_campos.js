/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0130 — campos de recontato no lead (CA-3-47, RN-139).
 *
 * A lista "Clientes para recontatar" precisa saber quando a vendedora marcou
 * que já chamou o cliente. Sem isso a lista nunca esvazia e ela perde a
 * confiança na tela.
 *
 * `recontato_em`: quando a vendedora marcou "contatado".
 * `recontato_por`: quem marcou (para auditoria e para o relatório).
 *
 * Nada é apagado: é só o registro de que houve contato.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('crm_leads')
    const nomes = []
    try {
      for (const f of col.fields || []) nomes.push(String(f.name))
    } catch (e0) {}

    if (nomes.indexOf('recontato_em') < 0) {
      try {
        col.fields.add(new DateField({ name: 'recontato_em' }))
        console.log('0130: campo recontato_em criado')
      } catch (e1) {
        console.log('0130: falhou recontato_em -> ' + String(e1).slice(0, 140))
      }
    }
    if (nomes.indexOf('recontato_por') < 0) {
      try {
        col.fields.add(new TextField({ name: 'recontato_por', max: 60 }))
        console.log('0130: campo recontato_por criado')
      } catch (e2) {
        console.log('0130: falhou recontato_por -> ' + String(e2).slice(0, 140))
      }
    }
    try {
      app.save(col)
    } catch (e3) {
      console.log('0130: falhou salvar colecao -> ' + String(e3).slice(0, 160))
    }
    console.log('0130: pronto')
  },
  (app) => {
    console.log('0130 revertida (campos permanecem)')
  },
)
