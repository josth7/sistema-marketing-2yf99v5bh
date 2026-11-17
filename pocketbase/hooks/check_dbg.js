/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/dbg-emp',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true }
    out.header = String(e.request.header.get('X-Empresa') || '(VAZIO)')
    // o que os grants dao
    const gs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('access_grants'),
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '',
      60,
      0,
    )
    out.grants = []
    for (const g of gs)
      out.grants.push({
        empresa: String(g.get('empresa') || '').slice(0, 10),
        role: String(g.get('role') || ''),
      })
    // e os criterios: quantos por empresa?
    const cr = app.findRecordsByFilter(
      app.findCollectionByNameOrId('alert_criteria'),
      '',
      '',
      300,
      0,
    )
    const porEmp = {}
    for (const c of cr) {
      const k = String(c.get('empresa') || '(vazio)').slice(0, 10)
      porEmp[k] = (porEmp[k] || 0) + 1
    }
    out.criterios_por_empresa = porEmp
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
