routerAdd(
  'GET',
  '/backend/v1/diag/olha-teste',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const col = $app.findCollectionByNameOrId('whatsapp_envios')
    const es = $app.findRecordsByFilter(col, "destino_telefone='5551999999999'", '', 5, 0)
    const out = []
    for (const en of es) {
      out.push({
        estado: String(en.get('estado') || ''),
        erro: String(en.get('ultimo_erro') || '').slice(0, 80),
        wamid: String(en.get('wa_message_id') || '').slice(0, 30),
        criado: String(en.get('created') || '').slice(0, 16),
      })
    }
    return e.json(200, { n: es.length, itens: out })
  },
  $apis.requireAuth(),
)
