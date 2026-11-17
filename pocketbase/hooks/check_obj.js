/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/objetivos-usados',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, porCanal: {}, amostra: [] }
    for (const m of app.findRecordsByFilter(
      app.findCollectionByNameOrId('metricas_diarias'),
      '',
      '',
      2000,
      0,
    )) {
      const c = String(m.get('canal') || '')
      const o = String(m.get('objetivo') || '(vazio)')
      out.porCanal[c] = out.porCanal[c] || {}
      out.porCanal[c][o] = (out.porCanal[c][o] || 0) + 1
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
