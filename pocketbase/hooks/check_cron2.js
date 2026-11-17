/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/cron2',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, campos: [], jobs: [] }
    const det = app.findCollectionByNameOrId('_cron_settings')
    for (const f of det.fields || []) out.campos.push(String(f.name))
    for (const r of app.findRecordsByFilter('_cron_settings', '', '', 200, 0)) {
      const o = {}
      for (const f of out.campos) {
        try {
          o[f] = String(r.get(f) || '')
        } catch (e1) {}
      }
      if (String(o.job || '').indexOf('meta') >= 0) out.jobs.push(o)
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
