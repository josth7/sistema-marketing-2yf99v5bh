/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/acha-gol7',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, empresas: [], usuario: [] }
    // as empresas cadastradas
    for (const x of app.findRecordsByFilter('empresas', '', '', 20, 0))
      out.empresas.push({
        id: x.id.slice(0, 10),
        nome: String(x.get('nome') || ''),
        apelido: String(x.get('apelido') || ''),
      })
    // usuarios com gol7 no nome
    for (const u of app.findRecordsByFilter(
      app.findCollectionByNameOrId('users'),
      '',
      '',
      300,
      0,
    )) {
      const nm = String(u.get('name') || '')
      if (nm.indexOf('Gol') >= 0 || nm.indexOf('GOO') >= 0 || nm.indexOf('Goo') >= 0)
        out.usuario.push({ email: String(u.get('email') || ''), nome: nm })
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
