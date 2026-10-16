/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0031 — cron do lembrete PAUSADO (_cron_settings, card a434ca96).
 *
 * Gate: destinatários reais pendentes do workshop (DH-07/CL-003, 22/10) —
 * SPEC-2-003: "Preparar job e inbox sem habilitar destinatários reais não
 * aprovados". Provas usam a rota tick com relógio de teste.
 */
migrate(
  (app) => {
    try {
      const cron = app.findCollectionByNameOrId('_cron_settings')
      let row
      try {
        row = app.findFirstRecordByData('_cron_settings', 'job', 'lembrete_revisao')
      } catch (_) {
        row = new Record(cron)
        row.set('job', 'lembrete_revisao')
      }
      row.set('disabled', true)
      row.set('reason', 'gate: destinatários reais pendentes do workshop (22/10) — card a434ca96')
      app.save(row)
      console.log('migração 0031 aplicada: lembrete_revisao PAUSADO (gate workshop)')
    } catch (eCron) {
      console.log('migração 0031: cron pausado não gravado — ' + String(eCron).slice(0, 120))
    }
  },
  (app) => {
    console.log('migração 0031 revertida (pausa do cron não é removida)')
  },
)
