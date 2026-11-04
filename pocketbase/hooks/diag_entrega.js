/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO TEMPORÁRIO (04/11) — o cliente RECEBEU?
 *
 * O dono disse que os clientes NÃO estão sendo respondidos. A nossa fila diz
 * "enviado" com `wamid` — mas `wamid` só significa que a Meta ACEITOU o envio.
 * Se ela recusou depois (130497, 131047, número inválido), a mensagem morre
 * em silêncio e o cliente nunca vê.
 *
 * Esta rota consulta a D-API pelo status REAL das mensagens e mostra o que
 * voltou. É a diferença entre "aceitei" e "entreguei".
 *
 * GET /backend/v1/diag/entrega
 */
routerAdd(
  'GET',
  '/backend/v1/diag/entrega',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const out = { consultas: [], erro: '' }

    // pega os envios ia_ reais e tenta o status de cada um na D-API
    var envios = []
    try {
      envios = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_envios'),
        "fixture=false && motivo~'ia'",
        '',
        40,
        0,
      )
    } catch (e0) {
      out.erro = 'listar envios: ' + String(e0).slice(0, 200)
      return e.json(200, out)
    }

    var chave = ''
    try {
      chave = String($secrets.get('DAPI_USER_KEY') || '')
    } catch (e1) {}
    out.tem_chave = chave !== ''

    for (const en of envios) {
      const waId = String(en.get('wa_message_id') || '')
      if (waId === '') continue
      const cxId = String(en.get('conexao') || '')
      var sessao = ''
      try {
        const cx = $app.findRecordById('whatsapp_conexoes', cxId)
        sessao = String(cx.get('session_id') || '')
      } catch (e2) {}

      const item = {
        destino: String(en.get('destino_telefone') || ''),
        wa_id: waId.slice(0, 30),
        criado: String(en.get('created') || '').slice(0, 19),
        nosso_estado: String(en.get('estado') || ''),
        sessao: sessao.slice(0, 24),
      }

      // D-API: status da mensagem
      if (chave !== '' && sessao !== '') {
        try {
          const resp = $http.send({
            url:
              'https://api.d-api.cloud/api/v1/messages/' +
              encodeURIComponent(waId) +
              '/status?sessionId=' +
              encodeURIComponent(sessao),
            method: 'GET',
            headers: { Authorization: chave, Accept: 'application/json' },
            timeout: 8,
          })
          item.dapi_status = Number(resp.statusCode || 0)
          var raw = resp.body
          var txt = ''
          if (Array.isArray(raw)) txt = String.fromCharCode.apply(null, raw)
          else if (typeof raw === 'string') txt = raw
          item.dapi_resposta = txt.slice(0, 300)
        } catch (e3) {
          item.dapi_status = -1
          item.dapi_resposta = String(e3).slice(0, 120)
        }
      }
      out.consultas.push(item)
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
