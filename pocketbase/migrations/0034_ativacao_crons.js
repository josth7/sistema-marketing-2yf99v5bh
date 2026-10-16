/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0034 — ATIVAÇÃO dos crons + política do relatório quinzenal
 * (workshop antecipado 16/10 — autorização do dono no formulário:
 * "Sim — ativar alertas, lembretes e relatório quinzenal").
 *
 * Ativa: alerta_avaliador_diario (09:15 UTC), lembrete_revisao (09:30 UTC),
 * relatorio_quinzenal (10:00 UTC).
 * Política do relatório: destinatários por E-MAIL (josth7@icloud.com,
 * anezia@haisan.com.br, haisan.ecmm@gmail.com) — o job resolve e-mail→usuário
 * na entrega (padrão do a70d5ab8).
 * Ata em 05_entregas/criterios-alerta-aprovados.md.
 */
migrate(
  (app) => {
    const crons = [
      { job: 'alerta_avaliador_diario', motivo: 'ativado — workshop antecipado 16/10 (dono)' },
      { job: 'lembrete_revisao', motivo: 'ativado — workshop antecipado 16/10 (dono)' },
      { job: 'relatorio_quinzenal', motivo: 'ativado — DH-07 confirmado pelo dono 16/10' },
    ]
    try {
      const cron = app.findCollectionByNameOrId('_cron_settings')
      for (const c of crons) {
        let row
        try {
          row = app.findFirstRecordByData('_cron_settings', 'job', c.job)
        } catch (_) {
          row = new Record(cron)
          row.set('job', c.job)
        }
        row.set('disabled', false)
        row.set('reason', c.motivo)
        app.save(row)
        console.log('migração 0034: ' + c.job + ' ATIVADO')
      }
    } catch (eCron) {
      console.log('migração 0034: crons não ativados — ' + String(eCron).slice(0, 120))
    }

    // ---- report_policy: destinatários confirmados (DH-07) ----
    try {
      const colP = app.findCollectionByNameOrId('report_policy')
      const politicas = app.findRecordsByFilter(colP, '', '-created', 10, 0)
      const emails = ['josth7@icloud.com', 'anezia@haisan.com.br', 'haisan.ecmm@gmail.com']
      for (const p of politicas) {
        if (p.get('fixture') === true) continue // política fixture fica isolada
        p.set('recipient_user_ids', JSON.stringify(emails))
        if (!p.get('approved_at')) p.set('approved_at', new Date().toISOString())
        if (!p.get('enabled')) p.set('enabled', true)
        app.save(p)
        console.log('migração 0034: política real com destinatários ' + emails.join(', '))
      }
    } catch (eP) {
      console.log('migração 0034: report_policy não atualizada — ' + String(eP).slice(0, 120))
    }
  },
  (app) => {
    console.log('migração 0034 revertida (ativação não é revertida — decisão do dono)')
  },
)
