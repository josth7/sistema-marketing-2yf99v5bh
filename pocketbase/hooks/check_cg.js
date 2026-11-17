/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/crons-google',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, agendados: [] }
    try {
      for (const c of app.findRecordsByFilter('_cron_settings', '', '', 200, 0))
        out.agendados.push({
          job: String(c.get('job') || ''),
          expr: String(c.get('expression') || c.get('cron') || ''),
          disabled: String(c.get('disabled') || ''),
        })
    } catch (e1) {
      out.erro = String(e1).slice(0, 80)
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
