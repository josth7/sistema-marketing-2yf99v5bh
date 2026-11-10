/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (10/11) — reproduzir o 405 da fila.
 *
 * A fila monta o MESMO corpo que funcionou no teste direto, mas recebe 405.
 * Aqui se reproduz o envio com o **sessionId da conexão** (não o que eu usei
 * antes) e com o **texto de um aviso real**, para achar a diferença.
 *
 * GET /backend/v1/diag/reproduz-405
 */
routerAdd(
  'GET',
  '/backend/v1/diag/reproduz-405',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, testes: [] }

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

    const secao = String(central.get('nome_segredo_chave') || 'DAPI_API_KEY')
    var chave = ''
    try {
      chave = String($secrets.get(secao) || '')
    } catch (e2) {}
    const sid = String(central.get('session_id') || '')

    out.diagnostico = {
      secao: secao,
      tem_chave: chave !== '',
      session_id: sid !== '' ? sid.slice(0, 18) : '(vazio)',
    }

    // o destino: número do Fábio
    var destino = ''
    try {
      const cs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor' && ativo=true",
        '',
        1,
        0,
      )
      if (cs.length > 0) destino = String(cs[0].get('numero') || '').replace(/[^0-9]/g, '')
    } catch (e3) {}

    // T1: corpo IDÊNTICO ao da fila
    var st1 = 0
    var r1 = ''
    try {
      const resp = $http.send({
        url: 'https://api.d-api.cloud/api/v1/messages/send/text',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: chave },
        body: JSON.stringify({ sessionId: sid, to: destino, text: 'teste fila 405' }),
        timeout: 20,
      })
      st1 = Number(resp.statusCode || 0)
      var rb = resp.body
      if (Array.isArray(rb)) r1 = String.fromCharCode.apply(null, rb)
      else r1 = String(rb)
    } catch (e4) {
      r1 = 'exc: ' + String(e4).slice(0, 80)
    }
    out.testes.push({
      caso: 'corpo da fila (sessionId da conexao)',
      status: st1,
      resposta: r1.replace(/[0-9]{10,}/g, '***').slice(0, 160),
    })

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
