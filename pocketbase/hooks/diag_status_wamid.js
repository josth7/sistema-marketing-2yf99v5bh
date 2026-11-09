/// <reference path="../pb_data/types.d.ts" />
/**
 * VERIFICAÇÃO (09/11) — o envio para número inválido foi recusado?
 *
 * O POST voltou 200 com `wamid`, mas nenhum evento de falha chegou ao webhook.
 * Duas hipóteses:
 *   1. a Meta recusou e o webhook da D-API não está entregando `message.failed`;
 *   2. o número inválido foi aceito (improvável).
 *
 * Aqui se consulta o STATUS da mensagem direto na D-API, pelo wamid.
 *
 * GET /backend/v1/diag/status-wamid?wamid=...
 */
routerAdd(
  'GET',
  '/backend/v1/diag/status-wamid',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const wamid = String(e.request.url.query().get('wamid') || '')
    const out = { ok: true, consultas: [] }

    var cx = null
    try {
      const cs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor' && ativo=true",
        '',
        1,
        0,
      )
      if (cs.length > 0) cx = cs[0]
    } catch (e0) {}
    if (!cx) return e.json(200, { ok: false, erro: 'sem conexão' })

    var chave = ''
    try {
      const nc = String(cx.get('nome_segredo_chave') || '')
      if (nc !== '') chave = String($secrets.get(nc) || '')
    } catch (e1) {}

    // tenta os caminhos usuais de consulta de status
    const caminhos = [
      '/api/v1/messages/' + encodeURIComponent(wamid),
      '/api/v1/messages/status/' + encodeURIComponent(wamid),
    ]
    for (const c of caminhos) {
      try {
        const r = $http.send({
          url: 'https://api.d-api.cloud' + c,
          method: 'GET',
          headers: { Authorization: chave, Accept: 'application/json' },
          timeout: 18,
        })
        var rb = r.body
        if (Array.isArray(rb)) rb = String.fromCharCode.apply(null, rb)
        out.consultas.push({
          caminho: c,
          status: Number(r.statusCode || 0),
          corpo: String(rb)
            .replace(/[0-9]{10,}/g, '***')
            .slice(0, 220),
        })
      } catch (e2) {
        out.consultas.push({ caminho: c, erro: String(e2).slice(0, 80) })
      }
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
