/// <reference path="../pb_data/types.d.ts" />
// teste de bisseccao: const no topo do arquivo (fora do handler)
const SENHA_PROVISORIA = 'Haisan@2026'

routerAdd(
  'GET',
  '/backend/v1/senha-t2',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    return e.json(200, { ok: true, t: 2 })
  },
  $apis.requireAuth(),
)
