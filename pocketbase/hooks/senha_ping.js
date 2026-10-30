/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/senha-ping',
  (e) => {
    return e.json(200, { ok: true, vivo: true })
  },
  $apis.requireAuth(),
)
