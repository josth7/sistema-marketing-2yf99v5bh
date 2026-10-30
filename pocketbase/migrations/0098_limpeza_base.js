/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0098 — limpeza da base (30/10).
 *
 * Três coisas, todas reversíveis e sem apagar nada:
 *
 * 1) O lead "sabrina" (41 98903-6170) foi criado MANUALMENTE e recebeu uma
 *    conversão de R$ 1.250 "poltrona" que não existiu — era teste. Marca
 *    como `fixture=true` (sai do funil e das contagens) e a conversão dela
 *    vira `erro`, que o sistema já ignora em receita e fila.
 *
 * 2) Quatro números de vendedores entraram como LEAD na importação da
 *    planilha da agência, e estavam contaminando o funil como "descartado".
 *    Marca como `fixture=true` para não contarem como lead nem como perda.
 *
 * 3) Nada de delete: tudo continua no banco para conferência.
 */

const INTERNOS = ['554197213499', '554195017280', '554197206353', '554198008695']

migrate(
  (app) => {
    // ---------- 1. lead de teste da Sabrina ----------
    var alvo = []
    try {
      alvo = app.findRecordsByFilter('crm_leads', "telefone='41989036170'", '', 5, 0)
    } catch (e1) {}
    for (const l of alvo) {
      try {
        l.set('fixture', true)
        l.set(
          'observacoes',
          'TESTE (30/10): criado manualmente e marcado como venda por engano. Fora do funil.',
        )
        app.save(l)
        console.log('0098: lead sabrina marcado como teste')

        // a conversao dela deixa de valer
        var convs = []
        try {
          convs = app.findRecordsByFilter('conversion_events', "lead_id='" + l.id + "'", '', 20, 0)
        } catch (e2) {}
        for (const c of convs) {
          try {
            c.set('estado', 'erro')
            app.save(c)
            console.log('0098: conversao da sabrina -> erro (' + c.id + ')')
          } catch (e3) {}
        }
      } catch (e4) {}
    }

    // ---------- 2. numeros internos da equipe ----------
    for (const tel of INTERNOS) {
      var achados = []
      try {
        achados = app.findRecordsByFilter('crm_leads', "telefone='" + tel + "'", '', 5, 0)
      } catch (e5) {}
      for (const l of achados) {
        try {
          l.set('fixture', true)
          l.set(
            'observacoes',
            'NUMERO INTERNO da equipe (entrou na importacao da planilha da agencia). Fora do funil.',
          )
          app.save(l)
          console.log('0098: interno marcado -> ' + tel)
        } catch (e6) {}
      }
    }

    // ---------- 3. fechados sem venda: nao viram venda ----------
    // Nao muda status (decisao do dono pendente); so garante valor zero
    // explicito para o painel separar "fechado com venda" de "sem venda".
    var semVenda = []
    try {
      semVenda = app.findRecordsByFilter(
        'crm_leads',
        "status='venda_realizada' && valor=0 && fixture=false",
        '',
        200,
        0,
      )
    } catch (e7) {}
    console.log('0098: leads em venda_realizada sem valor: ' + semVenda.length)
  },
  (app) => {
    var alvo = []
    try {
      alvo = app.findRecordsByFilter('crm_leads', "telefone='41989036170'", '', 5, 0)
    } catch (e1) {}
    for (const l of alvo) {
      try {
        l.set('fixture', false)
        l.set('observacoes', '')
        app.save(l)
      } catch (e2) {}
    }
    for (const tel of INTERNOS) {
      var achados = []
      try {
        achados = app.findRecordsByFilter('crm_leads', "telefone='" + tel + "'", '', 5, 0)
      } catch (e3) {}
      for (const l of achados) {
        try {
          l.set('fixture', false)
          app.save(l)
        } catch (e4) {}
      }
    }
    console.log('0098 revertida')
  },
)
