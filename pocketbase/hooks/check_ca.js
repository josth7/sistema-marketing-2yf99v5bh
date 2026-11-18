/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/cat-acoes',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, catalogo: {}, empresas: [] }
    for (const g of app.findRecordsByFilter(
      app.findCollectionByNameOrId('access_grants'),
      "revoked_at=''",
      '',
      300,
      0,
    )) {
      const role = String(g.get('role') || '')
      if (role === '') continue
      var atos = [],
        esc = []
      try {
        const r = g.get('actions')
        atos =
          Array.isArray(r) && r.length > 0 && typeof r[0] === 'number'
            ? JSON.parse(String.fromCharCode.apply(null, r))
            : typeof r === 'string'
              ? JSON.parse(r)
              : r || []
      } catch (e1) {}
      try {
        const r2 = g.get('scope_accounts')
        esc =
          Array.isArray(r2) && r2.length > 0 && typeof r2[0] === 'number'
            ? JSON.parse(String.fromCharCode.apply(null, r2))
            : typeof r2 === 'string'
              ? JSON.parse(r2)
              : r2 || []
      } catch (e2) {}
      if (!Array.isArray(atos)) continue
      if (!out.catalogo[role]) out.catalogo[role] = { acoes: [], escopos: [] }
      for (const a of atos)
        if (out.catalogo[role].acoes.indexOf(a) < 0) out.catalogo[role].acoes.push(a)
      for (const s of Array.isArray(esc) ? esc : [])
        if (out.catalogo[role].escopos.indexOf(s) < 0) out.catalogo[role].escopos.push(s)
    }
    for (const k in out.catalogo) out.catalogo[k].acoes.sort()
    // empresas: campos reais
    try {
      const det = app.findCollectionByNameOrId('empresas')
      out.campos_empresa = (det.fields || []).map(function (f) {
        return f.name
      })
      for (const x of app.findRecordsByFilter('empresas', '', '', 20, 0)) {
        out.empresas.push({
          id: x.id,
          apelido: String(x.get('apelido') || ''),
          nome: String(x.get('nome') || ''),
        })
      }
    } catch (e3) {
      out.erro_emp = String(e3).slice(0, 80)
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
