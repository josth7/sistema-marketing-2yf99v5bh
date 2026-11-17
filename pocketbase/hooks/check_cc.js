/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/campo-custo',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const det = app.findCollectionByNameOrId('metricas_diarias')
    const out = { ok: true, campos: [] }
    for (const f of det.fields || []) {
      const n = String(f.name)
      if (n.indexOf('custo') >= 0 || n.indexOf('gasto') >= 0 || n.indexOf('cost') >= 0)
        out.campos.push({ nome: n, tipo: String(f.type) })
    }
    // os 4 registros novos: o que tem em cada campo?
    const ms = app.findRecordsByFilter(
      app.findCollectionByNameOrId('metricas_diarias'),
      "canal='google_ads' && data='2026-11-17'",
      '',
      10,
      0,
    )
    out.registros = []
    for (const m of ms) {
      const r = {}
      for (const f of out.campos) {
        try {
          r[f.nome] = m.get(f.nome)
        } catch (e1) {}
      }
      r.camp = String(m.get('campanha_nome') || '').slice(0, 20)
      out.registros.push(r)
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
