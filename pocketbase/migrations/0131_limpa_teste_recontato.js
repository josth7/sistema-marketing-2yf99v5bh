/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0131 — desfaz a marcação de teste do recontato (05/11).
 *
 * Na prova do CA-3-47 eu marquei o lead "Vilmar" (da Elisangela) como
 * contatado para ver a lista encolher de 19 para 18. Era teste: o cliente
 * nunca foi chamado, então a marcação sai.
 *
 * Só toca no lead que tem `recontato_por` preenchido e foi marcado HOJE por
 * esta prova — pelo nome e telefone exatos.
 */
migrate(
  (app) => {
    const colL = app.findCollectionByNameOrId('crm_leads')
    var lead = null
    try {
      const a = app.findRecordsByFilter(colL, "telefone='554799574714'", '', 1, 0)
      if (a && a.length > 0) lead = a[0]
    } catch (e0) {}
    if (!lead) {
      console.log('0131: lead do teste nao encontrado')
      return
    }
    const marcado = String(lead.get('recontato_em') || '')
    if (marcado === '') {
      console.log('0131: lead nao esta marcado — nada a fazer')
      return
    }
    try {
      lead.set('recontato_em', '')
      lead.set('recontato_por', '')
      app.save(lead)
      console.log('0131: marcacao de teste removida (' + lead.id + ')')
    } catch (e1) {
      console.log('0131: falhou -> ' + String(e1).slice(0, 160))
    }
  },
  (app) => {
    console.log('0131 revertida')
  },
)
