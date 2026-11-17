/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/sem-empresa-metricas',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, itens: [] }
    for (const m of app.findRecordsByFilter(
      app.findCollectionByNameOrId('metricas_diarias'),
      "empresa=''",
      '',
      50,
      0,
    ))
      out.itens.push({
        canal: String(m.get('canal') || ''),
        campanha: String(m.get('campanha_nome') || '').slice(0, 28),
        data: String(m.get('data') || '').slice(0, 10),
        custo: Number(m.get('custo') || 0),
        criado: String(m.get('created') || '').slice(0, 16),
      })
    out.total = out.itens.length
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
