/// <reference path="../pb_data/types.d.ts" />

/**
 * 0125 — META DE 3 EM 3 HORAS (17/11, pedido do dono).
 *
 * O `cronAdd` no hook declara a expressão, MAS a lição conhecida é que **job
 * fora de `_cron_settings` simplesmente não roda**. Esta migração garante que o
 * job `meta_ingestao_diaria` exista na tabela com a expressão nova
 * tres-em-tres-horas e fique ativo.
 *
 * Antes: 1×/dia às 06:00 de Brasília. Com a campanha ligada, o painel mostrava
 * o gasto da manhã o dia inteiro (às 18:29 o real era R$ 43,47 e o painel
 * dizia R$ 5,24).
 *
 * Agora: 3 em 3 horas, no minuto 0 (UTC), = 00/03/06/09/12/15/18/21 em Brasília.
 *
 * Idempotente: se o job já existir, só atualiza a expressão e reativa.
 */
migrate(
  (app) => {
    const EXPRESSAO = '0 */3 * * *'
    const JOB = 'meta_ingestao_diaria'

    var existentes = []
    try {
      existentes = app.findRecordsByFilter('_cron_settings', "job='" + JOB + "'", '', 5, 0)
    } catch (e0) {
      console.log('0125: nao consegui ler _cron_settings -> ' + String(e0).slice(0, 120))
      return
    }

    if (existentes.length > 0) {
      // já existe: atualiza a expressão e garante ativo
      for (const r of existentes) {
        try {
          r.set('expression', EXPRESSAO)
          r.set('disabled', false)
          app.save(r)
        } catch (e1) {
          console.log('0125: nao atualizei -> ' + String(e1).slice(0, 120))
        }
      }
      console.log('0125: ' + JOB + ' atualizado para ' + EXPRESSAO)
      return
    }

    // não existe: cria
    try {
      const col = app.findCollectionByNameOrId('_cron_settings')
      const r = new Record(col)
      r.set('job', JOB)
      r.set('expression', EXPRESSAO)
      r.set('disabled', false)
      app.save(r)
      console.log('0125: ' + JOB + ' criado com ' + EXPRESSAO)
    } catch (e2) {
      console.log('0125: nao criei -> ' + String(e2).slice(0, 160))
    }
  },
  (app) => {
    // rollback: volta para 1×/dia às 06:00 de Brasília
    try {
      for (const r of app.findRecordsByFilter(
        '_cron_settings',
        "job='meta_ingestao_diaria'",
        '',
        5,
        0,
      )) {
        r.set('expression', '0 9 * * *')
        app.save(r)
      }
    } catch (e3) {}
  },
)
