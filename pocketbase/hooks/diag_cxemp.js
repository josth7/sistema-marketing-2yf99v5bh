routerAdd(
  'GET',
  '/backend/v1/diag/cx-empresa',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const cs = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_conexoes'),
      'ativo=true',
      '',
      20,
      0,
    )
    const out = []
    for (const c of cs)
      out.push({
        nome: String(c.get('nome_exibicao') || ''),
        papel: String(c.get('papel') || ''),
        empresa: String(c.get('empresa') || '(VAZIO)').slice(0, 12),
      })
    // e as conversas de hoje: nasceram com empresa?
    const convs = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_conversas'),
      "created>='2026-11-11'",
      '',
      20,
      0,
    )
    return e.json(200, {
      conexoes: out,
      conversas_hoje: convs.length,
      convs_com_empresa: convs.filter(function (x) {
        return String(x.get('empresa') || '') !== ''
      }).length,
    })
  },
  $apis.requireAuth(),
)
