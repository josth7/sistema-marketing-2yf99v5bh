/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/apaga-testes',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const ex = String(e.request.url.query().get('executar') || '') === '1'
    const out = { ok: true, apagados: 0, ids: [] }
    for (const m of app.findRecordsByFilter(
      app.findCollectionByNameOrId('metricas_diarias'),
      "campanha_id~'teste-' || campanha_id~'t2-'",
      '',
      30,
      0,
    )) {
      out.ids.push(String(m.get('campanha_nome') || ''))
      if (ex) {
        try {
          app.delete(m)
          out.apagados++
        } catch (e1) {}
      }
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
