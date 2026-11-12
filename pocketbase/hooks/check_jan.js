routerAdd(
  'GET',
  '/backend/v1/check/janela-hoje',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const msgs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "direcao='entrada'",
      '',
      300,
      0,
    )
    var ultima = ''
    for (const m of msgs) {
      const q = String(m.get('created') || '')
      if (q > ultima) ultima = q
    }
    // quantas nas ultimas 24h contando a partir da MAIS RECENTE
    const agora = new Date().getTime()
    var n24 = 0
    for (const m of msgs) {
      const q = new Date(String(m.get('created') || '').replace(' ', 'T')).getTime()
      if (q > 0 && agora - q < 24 * 3600000) n24++
    }
    const h24 = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "direcao='entrada' && created>='2026-11-11 17:00'",
      '',
      300,
      0,
    )
    return e.json(200, {
      ultima_entrada: ultima,
      agora_utc: new Date().toISOString().slice(0, 16),
      por_data_js: n24,
      por_filtro: h24.length,
    })
  },
  $apis.requireAuth(),
)
