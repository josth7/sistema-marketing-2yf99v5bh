/// <reference path="../pb_data/types.d.ts" />
/**
 * O BLOQUEIO DA META CAIU? (12/11 11:22).
 *
 * O erro 130497 ("Business account is restricted from messaging users in this
 * country") impedia a saudacao do vendedor de chegar. Aqui se testa o envio
 * por DOIS caminhos e se le a resposta da Meta:
 *
 *   1. template pelo numero do Fabio (o caso que falhou);
 *   2. mensagem de texto pela central (para saber se o bloqueio e so de template).
 *
 * IMPORTANTE: 1 envio so, para nao marcar o numero. Se falhar com 130497, NAO
 * repetir — cada tentativa e uma marca negativa.
 *
 * GET /backend/v1/check/meta-130497
 */
routerAdd(
  'GET',
  '/backend/v1/check/meta-130497',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, testes: [] }

    function chaveDe(rec) {
      var k = ''
      try {
        const n = String(rec.get('nome_segredo_chave') || '')
        if (n !== '') k = String($secrets.get(n) || '')
      } catch (e0) {}
      return k
    }

    // ---------- 1. template pelo numero do vendedor ----------
    var cxVend = null
    try {
      const cs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor' && ativo=true && apresentacao_ativa=true && fixture=false",
        '',
        1,
        0,
      )
      if (cs.length > 0) cxVend = cs[0]
    } catch (e1) {}

    if (cxVend) {
      const chave = chaveDe(cxVend)
      const modelo = String(cxVend.get('modelo_apresentacao_vendedor') || '')
      var st = 0
      var resp = ''
      try {
        const r = $http.send({
          url: 'https://api.d-api.cloud/api/v1/messages/send/template',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: chave },
          body: JSON.stringify({
            sessionId: String(cxVend.get('session_id') || ''),
            to: '5541999601233',
            template: { name: modelo, language: 'pt_BR', bodyVariables: ['Anezia', 'Fabio'] },
          }),
          timeout: 25,
        })
        st = Number(r.statusCode || 0)
        var rb = r.body
        resp = Array.isArray(rb) ? String.fromCharCode.apply(null, rb) : String(rb)
      } catch (e2) {
        resp = 'excecao: ' + String(e2).slice(0, 90)
      }
      out.testes.push({
        caminho: 'template pelo numero do vendedor',
        numero: String(cxVend.get('nome_exibicao') || ''),
        modelo: modelo,
        status: st,
        resposta: resp.replace(/[0-9]{10,}/g, '***').slice(0, 260),
        bloqueio_130497: resp.indexOf('130497') >= 0,
      })
    }

    // ---------- 2. texto pela central (o robo usa esta rota) ----------
    var cxCentral = null
    try {
      const cs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true && fixture=false",
        '',
        1,
        0,
      )
      if (cs.length > 0) cxCentral = cs[0]
    } catch (e3) {}

    if (cxCentral) {
      const chave = chaveDe(cxCentral)
      var st2 = 0
      var resp2 = ''
      try {
        const r2 = $http.send({
          url: 'https://api.d-api.cloud/api/v1/messages/send/text',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: chave },
          body: JSON.stringify({
            sessionId: String(cxCentral.get('session_id') || ''),
            to: '5541999601233',
            text: 'teste de bloqueio 12/11 11:22',
          }),
          timeout: 25,
        })
        st2 = Number(r2.statusCode || 0)
        var rb2 = r2.body
        resp2 = Array.isArray(rb2) ? String.fromCharCode.apply(null, rb2) : String(rb2)
      } catch (e4) {
        resp2 = 'excecao: ' + String(e4).slice(0, 90)
      }
      out.testes.push({
        caminho: 'texto pela central',
        numero: String(cxCentral.get('nome_exibicao') || ''),
        status: st2,
        resposta: resp2.replace(/[0-9]{10,}/g, '***').slice(0, 260),
        bloqueio_130497: resp2.indexOf('130497') >= 0,
      })
    }

    out.aviso = 'uma tentativa por caminho; se der 130497 o bloqueio continua'
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
