routerAdd(
  'GET',
  '/backend/v1/diag/testa-confirma',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    var seg = ''
    try {
      seg = String($secrets.get('MAESTRO_SHARED_SECRET') || '')
    } catch (eS) {}
    const col = $app.findCollectionByNameOrId('conversion_events')
    const cs = $app.findRecordsByFilter(col, 'fixture=false', '', 3, 0)
    if (cs.length === 0) return e.json(200, { ok: false, erro: 'sem conversao' })
    const id = cs[0].id
    const ts = String(Math.floor(new Date().getTime() / 1000))
    const caminho = '/backend/v1/conversoes/' + id + '/google'
    const mat = ts + '.POST.' + caminho + '.'
    const sig = $security.hs256(mat, seg)
    var r1 = null
    try {
      const r = $http.send({
        url: 'https://sistema-marketing-1f51e.shrd00.internal.goskip.dev' + caminho,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Maestro-Timestamp': ts,
          'X-Maestro-Signature': sig,
        },
        body: JSON.stringify({ estado: 'enviado' }),
        timeout: 25,
      })
      var cb = r.body
      if (Array.isArray(cb)) cb = String.fromCharCode.apply(null, cb)
      r1 = JSON.parse(String(cb))
    } catch (e1) {}
    // segunda vez: idempotente
    const ts2 = String(Math.floor(new Date().getTime() / 1000))
    const mat2 = ts2 + '.POST.' + caminho + '.'
    const sig2 = $security.hs256(mat2, seg)
    var r2 = null
    try {
      const r = $http.send({
        url: 'https://sistema-marketing-1f51e.shrd00.internal.goskip.dev' + caminho,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Maestro-Timestamp': ts2,
          'X-Maestro-Signature': sig2,
        },
        body: JSON.stringify({ estado: 'enviado' }),
        timeout: 25,
      })
      var c2 = r.body
      if (Array.isArray(c2)) c2 = String.fromCharCode.apply(null, c2)
      r2 = JSON.parse(String(c2))
    } catch (e2) {}
    return e.json(200, { ok: true, id: id, primeira: r1, segunda: r2 })
  },
  $apis.requireAuth(),
)
