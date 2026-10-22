/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0051 — Religa o cron do canal (SPEC-3-001, ativação real).
 *
 * A migração 0036 registrou o cron `analise_periodo_fechado` DESABILITADO
 * (gate da CA-3-01): a religação era o passo da ATIVAÇÃO REAL, que acontece
 * quando o dono grava o MAESTRO_SHARED_SECRET definitivo e a env
 * MAESTRO_WEBHOOK_URL (feitos em 22/10/2026, 11:09–11:10 UTC, confirmados).
 * A política real (0041) já está ativa com approval_record do dono.
 *
 * Esta migração religa o cron. Idempotente: reexecutar não quebra.
 */
migrate(
  (app) => {
    try {
      const cron = app.findCollectionByNameOrId('_cron_settings')
      let row
      try {
        row = app.findFirstRecordByData('_cron_settings', 'job', 'analise_periodo_fechado')
      } catch (_) {
        row = new Record(cron)
        row.set('job', 'analise_periodo_fechado')
      }
      row.set('disabled', false)
      row.set(
        'reason',
        'ativação real do canal (22/10/2026) — dono gravou MAESTRO_SHARED_SECRET definitivo e MAESTRO_WEBHOOK_URL; política real ativa (0041)',
      )
      app.save(row)
      console.log('migração 0051: cron analise_periodo_fechado RELIGADO')
    } catch (eCron) {
      console.log('migração 0051: cron não religado — ' + String(eCron).slice(0, 120))
    }
  },
  (app) => {
    console.log('migração 0051 revertida: cron volta ao estado anterior')
  },
)
