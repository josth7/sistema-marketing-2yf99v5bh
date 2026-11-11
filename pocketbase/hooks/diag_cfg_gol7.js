routerAdd(
  'GET',
  '/backend/v1/empresas/cfg-por-empresa',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const cfgs = $app.findRecordsByFilter('atendimento_config', '', '', 200, 0)
    const emps = {}
    for (const x of $app.findRecordsByFilter('empresas', '', '', 20, 0))
      emps[x.id] = String(x.get('apelido') || x.get('nome'))
    const out = []
    for (const c of cfgs)
      out.push({
        v: Number(c.get('versao') || 0),
        empresa: emps[String(c.get('empresa') || '')] || '(vazio)',
        ligado: c.get('ligado') === true,
        textos: Object.keys(JSON.parse(String(c.get('textos') || '{}'))).length,
      })
    out.sort(function (a, b) {
      return b.v - a.v
    })
    return e.json(200, { ultimas: out.slice(0, 4) })
  },
  $apis.requireAuth(),
)
