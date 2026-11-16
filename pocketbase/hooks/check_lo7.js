/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/limpa-obs',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const ex = String(e.request.url.query().get('executar') || '') === '1'
    const out = { ok: true, executar: ex, alterados: [] }
    for (const r of app.findRecordsByFilter('atendimento_config', '', '', 200, 0)) {
      var v = ''
      try {
        v = String(r.get('observacao') || '')
      } catch (e1) {
        continue
      }
      if (v.indexOf('Gol 7') >= 0 && ex) {
        try {
          r.set('observacao', v.replace(/Gol 7/g, 'GOO7'))
          app.save(r)
          out.alterados.push({ id: r.id.slice(0, 10), novo: String(r.get('observacao') || '') })
        } catch (e2) {
          out.erro = String(e2).slice(0, 120)
        }
      }
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
