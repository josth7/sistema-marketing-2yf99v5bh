routerAdd(
  'GET',
  '/backend/v1/diag/msgs-central',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const cxP = {}
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      '',
      '',
      60,
      0,
    ))
      cxP[c.id] = String(c.get('papel') || '')
    const agora = new Date().getTime()
    const msgs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "direcao='entrada'",
      '',
      600,
      0,
    )
    var central = 0,
      recentes = 0,
      exemplos = []
    for (const m of msgs) {
      const cx = String(m.get('conexao') || '')
      if (cxP[cx] !== 'central') continue
      central++
      const q = new Date(String(m.get('enviada_em') || m.get('created') || '')).getTime()
      if (!(q > 0)) continue
      const h = Math.round((agora - q) / 3600000)
      if (h <= 24) recentes++
      if (exemplos.length < 6)
        exemplos.push({ tel: String(m.get('contato_telefone') || '').slice(-6), horas: h })
    }
    return e.json(200, {
      total_msgs: msgs.length,
      central: central,
      ultimas24h: recentes,
      exemplos: exemplos,
    })
  },
  $apis.requireAuth(),
)
