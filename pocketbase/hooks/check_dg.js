/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/dias-google',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, porDia: [], resumo: {} }
    const por = {}
    for (const m of app.findRecordsByFilter(
      app.findCollectionByNameOrId('metricas_diarias'),
      "canal='google_ads' && empresa!=''",
      '-data',
      500,
      0,
    )) {
      const d = String(m.get('data') || '').slice(0, 10)
      if (d < '2026-11-11') continue
      if (!por[d]) por[d] = { data: d, gasto: 0, imp: 0, cli: 0, camp: 0 }
      por[d].gasto += Number(m.get('gasto') || 0)
      por[d].imp += Number(m.get('impressoes') || 0)
      por[d].cli += Number(m.get('cliques') || 0)
      por[d].camp++
    }
    const ks = Object.keys(por).sort()
    for (const k of ks) {
      por[k].gasto = Math.round(por[k].gasto * 100) / 100
      out.porDia.push(por[k])
    }
    out.resumo = {
      dias: ks.length,
      total:
        Math.round(
          out.porDia.reduce(function (a, b) {
            return a + b.gasto
          }, 0) * 100,
        ) / 100,
      hoje: por[new Date().toISOString().slice(0, 10)]
        ? por[new Date().toISOString().slice(0, 10)].gasto
        : 0,
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
