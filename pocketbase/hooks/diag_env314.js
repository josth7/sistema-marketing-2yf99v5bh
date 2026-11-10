routerAdd(
  'GET',
  '/backend/v1/diag/olha-envio314',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const c = $app.findRecordById('whatsapp_envios', 'd1i94f9p6owqett')
    return e.json(200, {
      ok: true,
      estado: String(c.get('estado')),
      erro: String(c.get('ultimo_erro') || '').slice(0, 90),
      wamid: String(c.get('wa_message_id') || '').slice(0, 24),
      tent: Number(c.get('tentativas') || 0),
    })
  },
  $apis.requireAuth(),
)
