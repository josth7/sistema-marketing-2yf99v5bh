routerAdd(
  'GET',
  '/backend/v1/diag/aviso-entregue',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const es = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_envios'),
      "motivo='aviso_vendedor'",
      '',
      50,
      0,
    )
    const out = []
    for (const en of es) {
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
      out.push({
        est: String(en.get('estado')),
        criado: String(en.get('created') || '').slice(0, 16),
        dest: String(en.get('destino_telefone') || '').slice(-6),
        eventos: evs,
      })
    }
    return e.json(200, { n: es.length, itens: out })
  },
  $apis.requireAuth(),
)
