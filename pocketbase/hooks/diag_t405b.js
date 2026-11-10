routerAdd(
  'GET',
  '/backend/v1/diag/t405b',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    var c = null
    try {
      const cs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true",
        '',
        1,
        0,
      )
      if (cs.length) c = cs[0]
    } catch (e1) {}
    if (!c) return e.json(200, { ok: false, erro: 'sem central' })
    var chave = ''
    try {
      chave = String($secrets.get(String(c.get('nome_segredo_chave') || '')) || '')
    } catch (e2) {}
    const sid = String(c.get('session_id') || '')
    var st = 0,
      resp = ''
    try {
      const r = $http.send({
        url: 'https://api.d-api.cloud/api/v1/messages/send/text',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: chave },
        body: JSON.stringify({ sessionId: sid, to: '554197213499', text: 'teste 405 b' }),
        timeout: 18,
      })
      st = Number(r.statusCode || 0)
      var rb = r.body
      if (Array.isArray(rb)) rb = String.fromCharCode.apply(null, rb)
      resp = String(rb)
    } catch (e3) {
      resp = 'exc: ' + String(e3).slice(0, 70)
    }
    return e.json(200, {
      ok: true,
      status: st,
      resposta: resp.replace(/[0-9]{10,}/g, '***').slice(0, 200),
    })
  },
  $apis.requireAuth(),
)
