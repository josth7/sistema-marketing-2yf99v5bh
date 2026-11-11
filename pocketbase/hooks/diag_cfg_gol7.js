routerAdd(
  'GET',
  '/backend/v1/empresas/versao-config',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const cfgs = $app.findRecordsByFilter('atendimento_config', '', '', 200, 0)
    var max = 0
    const out = []
    for (const c of cfgs) {
      const v = Number(c.get('versao') || 0)
      if (v > max) max = v
      out.push({
        v: v,
        empresa: String(c.get('empresa') || '').slice(0, 8),
        ligado: c.get('ligado') === true,
      })
    }
    out.sort(function (a, b) {
      return b.v - a.v
    })
    return e.json(200, { maior: max, ultimas: out.slice(0, 3), total: cfgs.length })
  },
  $apis.requireAuth(),
)
