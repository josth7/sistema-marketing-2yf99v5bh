/// <reference path="../pb_data/types.d.ts" />
// teste: função top-level usada dentro do callback
function dobro(x) {
  return x * 2
}
routerAdd(
  'GET',
  '/backend/v1/teste-topfuncao',
  (e) => {
    return e.json(200, { ok: true, r: dobro(21) })
  },
  $apis.requireAuth(),
)
