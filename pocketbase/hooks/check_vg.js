/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/v-google',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, porEmpresa: {}, hoje: [] }
    const nomes = {}
    for (const x of app.findRecordsByFilter('empresas', '', '', 20, 0))
      nomes[x.id] = String(x.get('apelido') || '')
    for (const m of app.findRecordsByFilter(
      app.findCollectionByNameOrId('metricas_diarias'),
      "canal='google_ads'",
      '-created',
      100,
      0,
    )) {
      const emp = nomes[String(m.get('empresa') || '')] || '(VAZIO)'
      out.porEmpresa[emp] = (out.porEmpresa[emp] || 0) + 1
      if (out.hoje.length < 6)
        out.hoje.push({
          emp: emp,
          data: String(m.get('data') || '').slice(0, 10),
          camp: String(m.get('campanha_nome') || '').slice(0, 26),
          imp: Number(m.get('impressoes') || 0),
          cli: Number(m.get('cliques') || 0),
          custo: Number(m.get('custo') || 0),
          conta: String(m.get('conta_id') || ''),
        })
    }
    out.hoje.sort(function (a, b) {
      return b.custo - a.custo
    })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
