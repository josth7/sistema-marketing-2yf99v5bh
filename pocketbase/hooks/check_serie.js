/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/serie-google',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const nomes = {}
    for (const x of app.findRecordsByFilter('empresas', '', '', 20, 0))
      nomes[x.id] = String(x.get('apelido') || '')
    const out = { ok: true, porEmpresa: {}, dias: {}, gasto: 0, imp: 0, cli: 0, min: '', max: '' }
    for (const m of app.findRecordsByFilter(
      app.findCollectionByNameOrId('metricas_diarias'),
      "canal='google_ads'",
      '',
      2000,
      0,
    )) {
      const emp = nomes[String(m.get('empresa') || '')] || '(VAZIO)'
      out.porEmpresa[emp] = (out.porEmpresa[emp] || 0) + 1
      if (emp !== 'Haisan') continue
      const d = String(m.get('data') || '').slice(0, 10)
      out.dias[d] = (out.dias[d] || 0) + 1
      out.gasto += Number(m.get('gasto') || 0)
      out.imp += Number(m.get('impressoes') || 0)
      out.cli += Number(m.get('cliques') || 0)
      if (out.min === '' || d < out.min) out.min = d
      if (d > out.max) out.max = d
    }
    out.gasto = Math.round(out.gasto * 100) / 100
    out.qtd_dias = Object.keys(out.dias).length
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
