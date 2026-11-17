/// <reference path="../pb_data/types.d.ts" />
/**
 * CRONS REGISTRADOS — o que está de fato em `_cron_settings` (17/11).
 *
 * Lição conhecida: **job fora de `_cron_settings` simplesmente não roda**. Antes
 * de mudar o horário da Meta de 1×/dia para 3 em 3 horas, preciso ver:
 *   - como o job da Meta está registrado hoje (expressão e se está ativo);
 *   - quais outros jobs existem, para não mexer no que não é meu.
 *
 * GET /backend/v1/check/crons
 */
routerAdd(
  'GET',
  '/backend/v1/check/crons',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, jobs: [], total: 0 }

    var regs = []
    try {
      regs = app.findRecordsByFilter('_cron_settings', '', 'job', 200, 0)
    } catch (e0) {
      out.erro = String(e0).slice(0, 140)
    }

    for (const r of regs) {
      out.jobs.push({
        id: r.id.slice(0, 8),
        job: String(r.get('job') || ''),
        expressao: String(r.get('expression') || ''),
        ativo: String(r.get('disabled') || 'false'),
      })
    }
    out.total = out.jobs.length
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
