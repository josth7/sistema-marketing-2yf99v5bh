routerAdd(
  'GET',
  '/backend/v1/diag/wamid314',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const c = $app.findRecordById('whatsapp_envios', 'd1i94f9p6owqett')
    const wid = String(c.get('wa_message_id') || '')
    const evs = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_eventos'),
      '',
      '',
      400,
      0,
    )
    const achados = []
    for (const ev of evs) {
      if (String(ev.get('ref_id') || '') === wid)
        achados.push({
          evento: String(ev.get('evento')),
          quando: String(ev.get('recebido_em') || '').slice(0, 16),
        })
    }
    return e.json(200, { wamid_len: wid.length, estado: String(c.get('estado')), eventos: achados })
  },
  $apis.requireAuth(),
)
