/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/final-check',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, google_haisan: { registros: 0, gasto: 0, imp: 0, cli: 0, datas: [] } }
    const nomes = {}
    for (const x of app.findRecordsByFilter('empresas', '', '', 20, 0))
      nomes[x.id] = String(x.get('apelido') || '')
    var g = 0,
      imp = 0,
      cli = 0,
      n = 0
    const datas = {}
    for (const m of app.findRecordsByFilter(
      app.findCollectionByNameOrId('metricas_diarias'),
      "canal='google_ads'",
      '',
      500,
      0,
    )) {
      const emp = nomes[String(m.get('empresa') || '')] || '(VAZIO)'
      if (emp !== 'Haisan') continue
      n++
      g += Number(m.get('gasto') || 0)
      imp += Number(m.get('impressoes') || 0)
      cli += Number(m.get('cliques') || 0)
      const d = String(m.get('data') || '').slice(0, 10)
      datas[d] = (datas[d] || 0) + 1
    }
    out.google_haisan = {
      registros: n,
      gasto: Math.round(g * 100) / 100,
      imp: imp,
      cli: cli,
      datas: Object.keys(datas).sort(),
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
