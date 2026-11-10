/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/diag/ver-orfaos',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const out = { ok: true, jobs: [], erro: '' }
    try {
      const rs = $app.findRecordsByFilter('_cron_settings', '', '', 200, 0)
      for (const r of rs)
        out.jobs.push({
          job: String(r.get('job') || ''),
          disabled: String(r.get('disabled') || ''),
        })
    } catch (e1) {
      out.erro = String(e1).slice(0, 120)
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
