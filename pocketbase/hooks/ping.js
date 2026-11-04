// ping
routerAdd(
  'GET',
  '/backend/v1/ping',
  (e) => e.json(200, { ok: true, t: new Date().toISOString() }),
  $apis.requireAuth(),
)
