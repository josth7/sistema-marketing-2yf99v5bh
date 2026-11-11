/// <reference path="../pb_data/types.d.ts" />
/**
 * POR QUE A FILA DÁ 405? (10/11) — CA-3-112.
 *
 * Os avisos ao vendedor saem com `erro_definitivo: 405 Not Allowed` (HTML do
 * nginx). O mesmo corpo enviado direto responde 200.
 *
 * Aqui se reproduz exatamente o que a fila monta, passo a passo:
 *   - a conexão (central);
 *   - o `nome_segredo_chave` e se a chave existe;
 *   - a URL;
 *   - o POST com esse corpo.
 *
 * GET /backend/v1/diag/porque-405
 */
routerAdd(
  'GET',
  '/backend/v1/diag/porque-405',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true }

    // a conexão da central (é quem envia o aviso)
    var cx = null
    try {
      const cs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true",
        '',
        1,
        0,
      )
      if (cs.length > 0) cx = cs[0]
    } catch (e0) {}
    if (!cx) return e.json(200, { ok: false, erro: 'sem central' })

    const secao = String(cx.get('nome_segredo_chave') || 'DAPI_API_KEY')
    const sessionId = String(cx.get('session_id') || '')
    var chave = ''
    try {
      chave = String($secrets.get(secao) || '')
    } catch (e1) {}

    out.conexao = {
      nome: String(cx.get('nome_exibicao') || ''),
      secao: secao,
      tem_chave: chave !== '',
      chave_len: chave.length,
      session_id: sessionId.slice(0, 20),
    }

    // T1: POST igual ao da fila
    var st1 = 0
    var r1 = ''
    try {
      const resp = $http.send({
        url: 'https://api.d-api.cloud/api/v1/messages/send/text',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: chave },
        body: JSON.stringify({
          sessionId: sessionId,
          to: '5541999601233',
          text: 'teste 405 diagnostico',
        }),
        timeout: 20,
      })
      st1 = Number(resp.statusCode || 0)
      var rb = resp.body
      if (Array.isArray(rb)) r1 = String.fromCharCode.apply(null, rb)
      else r1 = String(rb)
    } catch (e2) {
      r1 = 'exc: ' + String(e2).slice(0, 80)
    }
    out.t1_mesmo_corpo = { status: st1, resposta: r1.replace(/[0-9]{10,}/g, '***').slice(0, 200) }

    // T2: sem o header Authorization (para ver se o 405 é do header)
    var st2 = 0
    var r2 = ''
    try {
      const resp2 = $http.send({
        url: 'https://api.d-api.cloud/api/v1/messages/send/text',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ sessionId: sessionId, to: '5541999601233', text: 'x' }),
        timeout: 18,
      })
      st2 = Number(resp2.statusCode || 0)
    } catch (e3) {}
    out.t2_sem_chave = { status: st2 }

    // T3: a URL sem /api/v1 (para ver se o 405 é de rota)
    var st3 = 0
    try {
      const resp3 = $http.send({
        url: 'https://api.d-api.cloud/messages/send/text',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: chave },
        body: JSON.stringify({ sessionId: sessionId, to: '5541999601233', text: 'x' }),
        timeout: 18,
      })
      st3 = Number(resp3.statusCode || 0)
    } catch (e4) {}
    out.t3_url_curta = { status: st3 }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
