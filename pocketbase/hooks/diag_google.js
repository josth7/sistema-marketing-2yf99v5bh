routerAdd(
  'GET',
  '/backend/v1/diag/testa-google',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    var seg = ''
    try {
      seg = String($secrets.get('MAESTRO_SHARED_SECRET') || '')
    } catch (eS) {}
    if (seg === '') return e.json(200, { ok: false, erro: 'sem segredo' })
    const ts = String(Math.floor(new Date().getTime() / 1000))
    const caminho = '/backend/v1/conversoes/google/pendentes'
    const mat = ts + '.GET.' + caminho + '.'
    const sig = $security.hs256(mat, seg)
    var resp = null
    try {
      const r = $http.send({
        url: 'https://sistema-marketing-1f51e.shrd00.internal.goskip.dev' + caminho,
        method: 'GET',
        headers: { 'X-Maestro-Timestamp': ts, 'X-Maestro-Signature': sig },
        timeout: 25,
      })
      var cb = r.body
      if (Array.isArray(cb)) cb = String.fromCharCode.apply(null, cb)
      resp = JSON.parse(String(cb))
    } catch (e1) {
      return e.json(200, { ok: false, erro: String(e1).slice(0, 120) })
    }
    // procura sequencia de 10+ digitos na resposta inteira
    const bruto = JSON.stringify(resp)
    const m = bruto.match(/[0-9]{10,}/g)
    return e.json(200, {
      ok: true,
      status: resp.ok,
      total: resp.total,
      campos: resp.campos || [],
      digitos_longos: m ? m.slice(0, 3) : [],
      exemplo: resp.itens && resp.itens[0] ? resp.itens[0] : null,
    })
  },
  $apis.requireAuth(),
)
