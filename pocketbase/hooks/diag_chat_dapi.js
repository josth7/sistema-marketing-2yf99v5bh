/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO TEMPORÁRIO (04/11) — a mensagem de teste chegou ou a Meta recusou?
 *
 * O dono confirmou: a mensagem de teste NÃO chegou no celular dele.
 * A D-API respondeu 200 com wamid. Então ou (a) a Meta aceitou e descartou,
 * ou (b) o número tem algo que impede a entrega.
 *
 * Aqui eu pergunto à própria D-API quais mensagens existem naquele chat e com
 * qual status — em vez de confiar no 200 do envio.
 *
 * GET /backend/v1/diag/chat-dapi?destino=5541XXXXXXXXX
 */
routerAdd(
  'GET',
  '/backend/v1/diag/chat-dapi',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const destino = String(e.request.url.query().get('destino') || '').replace(/\D/g, '')
    if (destino === '') return e.json(422, { ok: false, erro: 'informe ?destino=' })

    const out = { destino: destino, chamadas: [] }

    var chave = ''
    try {
      chave = String($secrets.get('DAPI_USER_KEY') || '')
    } catch (e1) {}
    out.tem_chave = chave !== ''
    if (chave === '') return e.json(200, out)

    const tentativas = [
      'https://api.d-api.cloud/api/v1/chat/messages?phone=' + destino + '&limit=10',
      'https://api.d-api.cloud/api/v1/messages?to=' + destino + '&limit=10',
      'https://api.d-api.cloud/api/v1/chat/' + destino + '/messages?limit=10',
    ]

    for (const url of tentativas) {
      const item = { url: url.replace('https://api.d-api.cloud', ''), status: 0, corpo: '' }
      try {
        const resp = $http.send({
          url: url,
          method: 'GET',
          headers: { Authorization: chave, Accept: 'application/json' },
          timeout: 12,
        })
        item.status = Number(resp.statusCode || 0)
        var raw = resp.body
        var txt = ''
        if (Array.isArray(raw)) txt = String.fromCharCode.apply(null, raw)
        else if (typeof raw === 'string') txt = raw
        item.corpo = txt.slice(0, 700)
      } catch (err) {
        item.status = -1
        item.corpo = String(err).slice(0, 150)
      }
      out.chamadas.push(item)
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
