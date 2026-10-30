/// <reference path="../pb_data/types.d.ts" />
// bisseccao t4: rota /minha-senha/status isolada, com validatePassword
routerAdd(
  'GET',
  '/backend/v1/senha-t4',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const eu = $app.findRecordById('users', e.auth.id)
    var provisoria = false
    try {
      provisoria = eu.validatePassword('Haisan@2026')
    } catch (eV) {
      return e.json(200, { ok: true, erro_validate: String(eV).slice(0, 120) })
    }
    return e.json(200, { ok: true, provisoria: provisoria })
  },
  $apis.requireAuth(),
)
