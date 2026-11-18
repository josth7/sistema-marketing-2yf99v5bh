/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/dup-google',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, duplicados: [], resumo: {} }
    const chaves = {}
    var total = 0,
      gasto = 0
    for (const m of app.findRecordsByFilter(
      app.findCollectionByNameOrId('metricas_diarias'),
      "canal='google_ads'",
      '-data',
      1000,
      0,
    )) {
      total++
      gasto += Number(m.get('gasto') || 0)
      const k =
        String(m.get('campanha_id') || '') +
        '|' +
        String(m.get('data') || '').slice(0, 10) +
        '|' +
        String(m.get('empresa') || '')
      if (!chaves[k]) chaves[k] = []
      chaves[k].push({
        id: m.id.slice(0, 8),
        gasto: Number(m.get('gasto') || 0),
        criado: String(m.get('created') || '').slice(0, 16),
      })
    }
    for (const k in chaves) {
      if (chaves[k].length > 1)
        out.duplicados.push({
          chave: k.split('|')[1] + ' camp=' + k.split('|')[0],
          itens: chaves[k],
        })
    }
    out.resumo = {
      registros: total,
      gasto_total: Math.round(gasto * 100) / 100,
      chaves_unicas: Object.keys(chaves).length,
      duplicados: out.duplicados.length,
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
