routerAdd(
  'GET',
  '/backend/v1/check/apres-fabio',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const envs = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_envios'),
      "motivo='apresentacao_vendedor' && created>='2026-11-11 16:00'",
      '',
      50,
      0,
    )
    const out = []
    for (const en of envs)
      out.push({
        quando: String(en.get('created') || '').slice(11, 19),
        est: String(en.get('estado') || ''),
        erro: String(en.get('ultimo_erro') || '').slice(0, 60),
        dest: String(en.get('destino_telefone') || '').slice(-6),
      })
    var porEst = {}
    for (const x of out) porEst[x.est] = (porEst[x.est] || 0) + 1
    return e.json(200, { n: envs.length, por_estado: porEst, itens: out.slice(0, 6) })
  },
  $apis.requireAuth(),
)
