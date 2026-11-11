routerAdd(
  'GET',
  '/backend/v1/check/motivo-failed',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const envs = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_envios'),
      "dedupe_key~'teste-cmp-'",
      '',
      5,
      0,
    )
    if (!envs.length) return e.json(200, { ok: false, erro: 'sem envio' })
    const wid = String(envs[0].get('wa_message_id') || '')
    const evs = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_eventos'),
      "ref_id='" + wid + "'",
      '',
      5,
      0,
    )
    const out = []
    for (const x of evs)
      out.push({
        evento: String(x.get('evento')),
        codigo: String(x.get('codigo_erro') || '').slice(0, 300),
      })
    return e.json(200, { wamid: wid !== '', eventos: out })
  },
  $apis.requireAuth(),
)
