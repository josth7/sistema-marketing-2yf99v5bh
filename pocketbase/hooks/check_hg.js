/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/hist-google',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, antes: [], resumo: {} }
    const por = {}
    var n = 0,
      total = 0
    for (const m of app.findRecordsByFilter(
      app.findCollectionByNameOrId('metricas_diarias'),
      "canal='google_ads'",
      '-data',
      1000,
      0,
    )) {
      const d = String(m.get('data') || '').slice(0, 10)
      n++
      const g = Number(m.get('gasto') || 0)
      total += g
      if (!por[d])
        por[d] = {
          data: d,
          gasto: 0,
          imp: 0,
          camp: 0,
          criado: String(m.get('created') || '').slice(0, 16),
        }
      por[d].gasto += g
      por[d].imp += Number(m.get('impressoes') || 0)
      por[d].camp++
    }
    const ks = Object.keys(por).sort()
    for (const k of ks) {
      if (k >= '2026-11-11') continue
      por[k].gasto = Math.round(por[k].gasto * 100) / 100
      out.antes.push(por[k])
    }
    out.resumo = {
      total_registros: n,
      total_gasto: Math.round(total * 100) / 100,
      dias_antes: out.antes.length,
      soma_antes:
        Math.round(
          out.antes.reduce(function (a, b) {
            return a + b.gasto
          }, 0) * 100,
        ) / 100,
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
