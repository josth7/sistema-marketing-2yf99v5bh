/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/cron3',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, json: [] }
    const rs = app.findRecordsByFilter('_cron_settings', "job='meta_ingestao_diaria'", '', 3, 0)
    for (const r of rs) {
      try {
        out.json.push(JSON.stringify(r))
      } catch (e1) {
        out.json.push('erro: ' + String(e1).slice(0, 60))
      }
    }
    // e o struct cru da colecao
    try {
      const det = app.findCollectionByNameOrId('_cron_settings')
      out.fields = (det.fields || []).map(function (f) {
        return f.name
      })
    } catch (e2) {}
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
