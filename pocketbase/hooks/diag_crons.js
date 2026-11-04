/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO TEMPORÁRIO (04/11) — o cron do motor está rodando?
 *
 * O dono disse: clientes estão ficando sem resposta. Achei 2 conversas que
 * DEVERIAM ter sido atendidas e não foram. Preciso saber se o cron que decide
 * está ativo, se rodou, e o que ele fez na última execução.
 *
 * GET /backend/v1/diag/crons
 */
routerAdd(
  'GET',
  '/backend/v1/diag/crons',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const out = { crons: [], logs_recentes: [], erro: '' }

    try {
      const col = $app.findCollectionByNameOrId('_cron_settings')
      const regs = $app.findRecordsByFilter(col, '', '', 100, 0)
      for (const r of regs) {
        out.crons.push({
          job: String(r.get('job') || ''),
          disabled: r.get('disabled') === true,
          reason: String(r.get('reason') || '').slice(0, 80),
          lastRun: String(r.get('lastRun') || '').slice(0, 19),
          lastStatus: String(r.get('lastStatus') || ''),
          lastError: String(r.get('lastError') || '').slice(0, 120),
          updated: String(r.get('updated') || '').slice(0, 19),
        })
      }
    } catch (e0) {
      out.erro = 'cron_settings: ' + String(e0).slice(0, 200)
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
