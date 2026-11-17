/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/testa-mapa',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true }
    try {
      out.mapa = String($secrets.get('MAPA_CONTA_EMPRESA') || '(vazio)')
    } catch (e1) {
      out.mapa = '(erro)'
    }
    try {
      out.google = String($secrets.get('EMPRESA_GOOGLE_ADS') || '(vazio)')
    } catch (e2) {}
    // a empresa do id do GOO7 existe?
    try {
      const g = app.findRecordById('empresas', '78b71rygx3rtnwg')
      out.goo7 = {
        apelido: String(g.get('apelido') || ''),
        nome: String(g.get('nome') || '').slice(0, 20),
      }
    } catch (e3) {
      out.goo7 = '(nao achou)'
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
