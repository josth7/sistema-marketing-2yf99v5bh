/// <reference path="../pb_data/types.d.ts" />
// bisseccao t3: usa e.requestInfo().body (suspeito nº1)
routerAdd(
  'POST',
  '/backend/v1/senha-t3',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    var dados = {}
    try {
      dados = e.requestInfo().body || {}
    } catch (eB) {
      return e.json(400, { ok: false, erro: 'corpo invalido' })
    }
    return e.json(200, { ok: true, campos: Object.keys(dados).join(',') })
  },
  $apis.requireAuth(),
)
