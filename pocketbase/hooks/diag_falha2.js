/// <reference path="../pb_data/types.d.ts" />
/**
 * CAPTURA DO `message.failed` (09/11) — tentativa 2, CA-3-108.
 *
 * A tentativa anterior usou 5551999999999 (formato válido, assinante
 * inexistente) e a Meta não gerou evento de falha. Agora uso um número que a
 * Meta **sabe** recusar: um formato claramente inválido (curto demais).
 *
 * Também testo se a D-API tem rota de status por outro caminho, para descobrir
 * o formato sem depender do webhook.
 *
 * GET /backend/v1/diag/forca-falha2
 */
routerAdd(
  'GET',
  '/backend/v1/diag/forca-falha2',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, tentativas: [] }

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
    if (!cx) return e.json(200, { ok: false, erro: 'sem conexão' })

    const modelo = String(cx.get('modelo_apresentacao_vendedor') || '')
    var chave = ''
    try {
      const nc = String(cx.get('nome_segredo_chave') || '')
      if (nc !== '') chave = String($secrets.get(nc) || '')
    } catch (e1) {}

    // número claramente inválido: curto demais para o WhatsApp
    const destinos = ['5551999', '0000000000000']

    for (const destino of destinos) {
      var status = 0
      var corpo = ''
      try {
        const r = $http.send({
          url: 'https://api.d-api.cloud/api/v1/messages/send/template',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: chave },
          body: JSON.stringify({
            sessionId: String(cx.get('session_id') || ''),
            to: destino,
            template: { name: modelo, language: 'pt_BR', bodyVariables: ['Teste', 'Haisan'] },
          }),
          timeout: 22,
        })
        status = Number(r.statusCode || 0)
        var rb = r.body
        if (Array.isArray(rb)) corpo = String.fromCharCode.apply(null, rb)
        else corpo = String(rb)
      } catch (e2) {
        corpo = 'excecao: ' + String(e2).slice(0, 100)
      }
      out.tentativas.push({
        destino: destino,
        status: status,
        resposta: corpo.replace(/[0-9]{10,}/g, '***').slice(0, 260),
      })
    }

    out.aviso = 'se a D-API recusar na hora, o 4xx já é o motivo — não precisa do webhook'
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
