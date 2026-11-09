/// <reference path="../pb_data/types.d.ts" />
/**
 * CAPTURA DO `message.failed` REAL (09/11) — CA-3-108.
 *
 * **O problema:** o parser do webhook lê `data.error.message` / `data.error.code`.
 * Nunca houve um `message.failed` gravado, então não se sabe se esse é o formato
 * verdadeiro. Se não for, o vendedor vê "falha_nao_informada" quando a Meta
 * recusar.
 *
 * **O que esta rota faz:** envia um template para um **número inválido de
 * propósito** (5551999999999 — DDD 51, assinante impossível). A D-API aceita o
 * POST e a Meta recusa depois, gerando o `message.failed` que eu quero ver.
 *
 * **Não toca em cliente.** O destino é um número que não existe.
 *
 * GET /backend/v1/diag/forca-falha
 */
routerAdd(
  'GET',
  '/backend/v1/diag/forca-falha',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true }

    var cx = null
    try {
      const cs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor' && ativo=true && apresentacao_ativa=true",
        '',
        1,
        0,
      )
      if (cs.length > 0) cx = cs[0]
    } catch (e0) {}
    if (!cx) return e.json(200, { ok: false, erro: 'sem conexão com apresentação ligada' })

    const modelo = String(cx.get('modelo_apresentacao_vendedor') || '')
    var chave = ''
    try {
      const nc = String(cx.get('nome_segredo_chave') || '')
      if (nc !== '') chave = String($secrets.get(nc) || '')
    } catch (e1) {}

    // número que não existe: assinante 999999999 não é válido
    const destino = '5551999999999'

    var status = 0
    var resposta = ''
    var wamid = ''
    try {
      const r = $http.send({
        url: 'https://api.d-api.cloud/api/v1/messages/send/template',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: chave },
        body: JSON.stringify({
          sessionId: String(cx.get('session_id') || ''),
          to: destino,
          template: {
            name: modelo,
            language: 'pt_BR',
            bodyVariables: ['Teste', 'Haisan'],
          },
        }),
        timeout: 25,
      })
      status = Number(r.statusCode || 0)
      var rb = r.body
      if (Array.isArray(rb)) resposta = String.fromCharCode.apply(null, rb)
      else resposta = String(rb)
      try {
        const j = JSON.parse(resposta)
        wamid = String(j.messageId || j.id || '')
      } catch (e2) {}
    } catch (e3) {
      return e.json(200, { ok: false, erro: 'D-API: ' + String(e3).slice(0, 100) })
    }

    out.status_dapi = status
    out.wamid = wamid
    out.destino_invalido = destino
    out.resposta = resposta.replace(/[0-9]{10,}/g, '***').slice(0, 300)
    out.aviso = 'a Meta recusa depois; o message.failed chega no webhook em segundos'

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
