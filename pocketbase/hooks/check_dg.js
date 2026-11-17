/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/det-google',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, itens: [] }
    for (const m of app.findRecordsByFilter(
      app.findCollectionByNameOrId('metricas_diarias'),
      "canal='google_ads'",
      '-data',
      100,
      0,
    ))
      out.itens.push({
        data: String(m.get('data') || '').slice(0, 10),
        campanha: String(m.get('campanha_nome') || '').slice(0, 30),
        imp: Number(m.get('impressoes') || 0),
        cli: Number(m.get('cliques') || 0),
        custo: Number(m.get('custo') || 0),
        emp: String(m.get('empresa') || '').slice(0, 8),
        criado: String(m.get('created') || '').slice(0, 16),
      })
    out.total = out.itens.length
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
