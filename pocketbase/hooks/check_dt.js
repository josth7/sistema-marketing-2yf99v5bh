routerAdd(
  'GET',
  '/backend/v1/check/delivered-teste',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const envs = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_envios'),
      "dedupe_key~'teste-cmp-'",
      '',
      5,
      0,
    )
    const out = []
    for (const en of envs) {
      const wid = String(en.get('wa_message_id') || '')
      var evs = []
      if (wid !== '') {
        try {
          const e2 = $app.findRecordsByFilter(
            $app.findCollectionByNameOrId('whatsapp_eventos'),
            "ref_id='" + wid + "'",
            '',
            5,
            0,
          )
          for (const x of e2) evs.push(String(x.get('evento')))
        } catch (e3) {}
      }
      out.push({ est: String(en.get('estado')), wamid: wid !== '', eventos: evs })
    }
    return e.json(200, { itens: out })
  },
  $apis.requireAuth(),
)
