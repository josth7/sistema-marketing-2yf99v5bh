routerAdd(
  'GET',
  '/backend/v1/check/ia-hoje2',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const envs = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_envios'),
      "motivo='ia_resposta' && created>='2026-11-11 16:00'",
      '',
      100,
      0,
    )
    const out = []
    for (const en of envs)
      out.push({
        quando: String(en.get('created') || '').slice(11, 19),
        est: String(en.get('estado') || ''),
        dest: String(en.get('destino_telefone') || '').slice(-6),
        texto: String(en.get('texto') || '').slice(0, 45),
      })
    var porEstado = {}
    for (const x of out) porEstado[x.est] = (porEstado[x.est] || 0) + 1
    return e.json(200, { n: envs.length, por_estado: porEstado, ultimos: out.slice(0, 8) })
  },
  $apis.requireAuth(),
)
