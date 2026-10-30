/// <reference path="../pb_data/types.d.ts" />
// teste de bisseccao: mesmo handler, sem const no topo
routerAdd(
  'GET',
  '/backend/v1/senha-t1',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    return e.json(200, { ok: true, t: 1 })
  },
  $apis.requireAuth(),
)
