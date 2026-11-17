/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/acha-reg',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, itens: [] }
    // os 4 enviados: campanhas "PESQ" de hoje
    const ms = app.findRecordsByFilter(
      app.findCollectionByNameOrId('metricas_diarias'),
      "canal='google_ads' && campanha_nome~'PESQ'",
      '-created',
      20,
      0,
    )
    for (const m of ms)
      out.itens.push({
        camp: String(m.get('campanha_nome') || '').slice(0, 24),
        data: String(m.get('data') || '').slice(0, 10),
        imp: Number(m.get('impressoes') || 0),
        cli: Number(m.get('cliques') || 0),
        gasto: Number(m.get('gasto') || 0),
        emp: String(m.get('empresa') || '').slice(0, 8),
        criado: String(m.get('created') || '').slice(0, 16),
      })
    out.total = out.itens.length
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
