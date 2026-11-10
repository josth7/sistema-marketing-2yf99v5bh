routerAdd(
  'GET',
  '/backend/v1/diag/estado-conv4',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const ids = ['wtelugoyzyp25z1', 'fwh177ozmpxw7fa', '3wxzg24n4i1cr0i', 'dd7i7anlixhc061']
    const out = []
    for (const id of ids) {
      var c = null
      try {
        c = $app.findRecordById('whatsapp_envios', id)
      } catch (e) {
        out.push({ id: id, erro: 'nao achou' })
        continue
      }
      var evs = 0
      try {
        const wid = String(c.get('wa_message_id') || '')
        if (wid !== '') {
          const es = $app.findRecordsByFilter(
            $app.findCollectionByNameOrId('whatsapp_eventos'),
            "ref_id='" + wid + "'",
            '',
            5,
            0,
          )
          evs = es.length
          var tipos = []
          for (const x of es) tipos.push(String(x.get('evento')))
        }
      } catch (e2) {}
      out.push({
        envio: id.slice(0, 10),
        estado: String(c.get('estado')),
        erro: String(c.get('ultimo_erro') || '').slice(0, 50),
        wamid: String(c.get('wa_message_id') || '') !== '',
        eventos: evs,
        tipos: tipos,
      })
    }
    return e.json(200, { itens: out })
  },
  $apis.requireAuth(),
)
