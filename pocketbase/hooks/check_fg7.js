/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/fix-goo7',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const ex = String(e.request.url.query().get('executar') || '') === '1'
    const out = { ok: true, executar: ex, antes: [], depois: [] }
    // 1. a empresa
    for (const x of app.findRecordsByFilter(
      'empresas',
      "apelido='Gol 7' || nome='Gol 7'",
      '',
      5,
      0,
    )) {
      out.antes.push({
        tipo: 'empresa',
        nome: String(x.get('nome') || ''),
        apelido: String(x.get('apelido') || ''),
      })
      if (ex) {
        try {
          if (String(x.get('nome') || '') === 'Gol 7') x.set('nome', 'GOO7')
          if (String(x.get('apelido') || '') === 'Gol 7') x.set('apelido', 'GOO7')
          app.save(x)
          out.depois.push({
            tipo: 'empresa',
            nome: String(x.get('nome') || ''),
            apelido: String(x.get('apelido') || ''),
          })
        } catch (e1) {
          out.erro1 = String(e1).slice(0, 120)
        }
      }
    }
    // 2. o usuario da Sabrina
    for (const u of app.findRecordsByFilter(
      app.findCollectionByNameOrId('users'),
      '',
      '',
      300,
      0,
    )) {
      const nm = String(u.get('name') || '')
      if (nm.indexOf('Gol 7') >= 0) {
        out.antes.push({ tipo: 'usuario', email: String(u.get('email') || ''), nome: nm })
        if (ex) {
          try {
            u.set('name', nm.replace(/Gol 7/g, 'GOO7'))
            app.save(u)
            out.depois.push({
              tipo: 'usuario',
              email: String(u.get('email') || ''),
              nome: String(u.get('name') || ''),
            })
          } catch (e2) {
            out.erro2 = String(e2).slice(0, 120)
          }
        }
      }
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
