/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0120 — desfaz o teste de preenchimento (04/11).
 *
 * A prova da rota `vendas-sem-valor/preencher` gravou R$ 100 numa venda real
 * (Guilherme AmzOne) para ver o valor entrar. Era teste, então volta a zero e
 * o evento de trilha que ele criou é removido — a venda continua em
 * "venda realizada", exatamente como estava, aguardando o valor de verdade.
 *
 * Só toca neste lead e no evento marcado como preenchimento de teste.
 */
migrate(
  (app) => {
    const colL = app.findCollectionByNameOrId('crm_leads')
    const colEv = app.findCollectionByNameOrId('crm_lead_events')

    var lead = null
    try {
      const a = app.findRecordsByFilter(colL, "nome='Guilherme AmzOne'", '', 1, 0)
      if (a && a.length > 0) lead = a[0]
    } catch (e0) {}

    if (!lead) {
      console.log('0120: lead nao encontrado')
      return
    }

    // só desfaz se ainda for exatamente o valor do teste
    const v = Number(lead.get('valor') || 0)
    if (v !== 100) {
      console.log('0120: valor atual e ' + v + ' (nao e o teste) — nada a fazer')
      return
    }

    try {
      lead.set('valor', 0)
      app.save(lead)
      console.log('0120: valor do teste zerado em ' + lead.id)
    } catch (e1) {
      console.log('0120: falhou zerar -> ' + String(e1).slice(0, 160))
    }

    try {
      const evs = app.findRecordsByFilter(colEv, "lead_id='" + lead.id + "'", '', 100, 0)
      for (const ev of evs) {
        const txt = String(ev.get('texto') || '')
        if (txt.indexOf('VALOR PREENCHIDO: R$ 100.00') === 0) {
          try {
            app.delete(ev)
            console.log('0120: evento de teste removido')
          } catch (e2) {}
        }
      }
    } catch (e3) {}
  },
  (app) => {
    console.log('0120 revertida')
  },
)
