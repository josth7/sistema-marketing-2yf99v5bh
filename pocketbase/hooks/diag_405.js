/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (10/11) — o 405 no aviso ao vendedor.
 *
 * Os avisos gerados vão para o número certo, mas a D-API responde
 * `405 Not Allowed` (HTML do nginx). O corpo do envio está sendo montado pelo
 * caminho de TEXTO LIVRE. Aqui se testa o mesmo POST direto para saber se o
 * problema é o caminho, o método ou a janela.
 *
 * GET /backend/v1/diag/testa-405
 */
routerAdd(
  'GET',
  '/backend/v1/diag/testa-405',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, tentativas: [] }

    var central = null
    try {
      const cs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true",
        '',
        1,
        0,
      )
      if (cs.length > 0) central = cs[0]
    } catch (e1) {}
    if (!central) return e.json(200, { ok: false, erro: 'sem central' })

    var chave = ''
    try {
      const nc = String(central.get('nome_segredo_chave') || '')
      if (nc !== '') chave = String($secrets.get(nc) || '')
    } catch (e2) {}

    const sid = String(central.get('session_id') || '')
    const destino = '5541999601233'

    // caminhos candidatos para texto
    const caminhos = [
      '/api/v1/messages/send/text',
      '/api/v1/messages/text',
      '/api/v1/messages/send',
    ]
    for (const c of caminhos) {
      var st = 0
      var corpo = ''
      try {
        const r = $http.send({
          url: 'https://api.d-api.cloud' + c,
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: chave },
          body: JSON.stringify({ sessionId: sid, to: destino, text: 'teste caminho' }),
          timeout: 18,
        })
        st = Number(r.statusCode || 0)
        var rb = r.body
        if (Array.isArray(rb)) rb = String.fromCharCode.apply(null, rb)
        corpo = String(rb)
      } catch (e3) {
        corpo = 'exc: ' + String(e3).slice(0, 60)
      }
      out.tentativas.push({
        caminho: c,
        status: st,
        resposta: corpo.replace(/[0-9]{10,}/g, '***').slice(0, 140),
      })
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
