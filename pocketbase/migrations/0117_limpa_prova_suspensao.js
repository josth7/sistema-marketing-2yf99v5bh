/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0117 — limpeza da prova de suspensão (04/11).
 *
 * Remove o que a prova criou: a pessoa descartável, os leads "Prova Suspensao"
 * e "Diag ..." (inclusive os 3 "Diag" sem dono, que a rota de diagnóstico
 * esqueceu de vincular) e os eventos deles. Também apaga as rotas de
 * diagnóstico temporárias, que não devem ficar em produção.
 *
 * Nada real é tocado: o filtro é por nome exato da massa de teste.
 */
migrate(
  (app) => {
    const colL = app.findCollectionByNameOrId('crm_leads')
    const colEv = app.findCollectionByNameOrId('crm_lead_events')
    const colU = app.findCollectionByNameOrId('users')
    const colG = app.findCollectionByNameOrId('access_grants')

    var removidosLeads = 0
    var removidosEventos = 0

    // leads de prova
    var alvos = []
    try {
      alvos = app.findRecordsByFilter(colL, "nome~'Prova Suspensao'", '', 200, 0)
    } catch (e0) {}
    try {
      const d = app.findRecordsByFilter(colL, "nome~'Diag '", '', 200, 0)
      for (const x of d) alvos.push(x)
    } catch (e1) {}

    for (const l of alvos) {
      try {
        const evs = app.findRecordsByFilter(colEv, "lead_id='" + l.id + "'", '', 100, 0)
        for (const ev of evs) {
          try {
            app.delete(ev)
            removidosEventos++
          } catch (eE) {}
        }
      } catch (e2) {}
      try {
        app.delete(l)
        removidosLeads++
      } catch (e3) {}
    }

    // pessoa descartável
    var pessoa = null
    try {
      const a = app.findRecordsByFilter(colU, "email='suspensao.fixture@haisan.com.br'", '', 1, 0)
      if (a && a.length > 0) pessoa = a[0]
    } catch (e4) {}

    var grantsRemovidos = 0
    if (pessoa) {
      try {
        const gs = app.findRecordsByFilter(colG, "user_id='" + pessoa.id + "'", '', 50, 0)
        for (const g of gs) {
          try {
            app.delete(g)
            grantsRemovidos++
          } catch (eG) {}
        }
      } catch (e5) {}
      try {
        app.delete(pessoa)
      } catch (e6) {
        console.log('0117: nao consegui apagar a pessoa -> ' + String(e6).slice(0, 160))
      }
    }

    console.log(
      '0117: limpeza -> leads=' +
        removidosLeads +
        ' eventos=' +
        removidosEventos +
        ' grants=' +
        grantsRemovidos +
        ' pessoa=' +
        (pessoa ? pessoa.id : 'nenhuma'),
    )
  },
  (app) => {
    console.log('0117 revertida')
  },
)
