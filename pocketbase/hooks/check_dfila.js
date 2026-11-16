/// <reference path="../pb_data/types.d.ts" />
/**
 * POR QUE A FILA DIZ 5xx E O MESMO POST DÁ 200 (16/11).
 *
 * Descobri que as 30 apresentações de 13–16/11 têm a `legenda` CORRETA e
 * falharam todas com `dapi_http_5xx`. O mesmo POST, feito daqui, devolve 200 —
 * inclusive para o destino que a fila marcou como erro.
 *
 * Suspeita: o `status` que a fila lê não é HTTP 5xx. O código faz
 * `Number(resp.statusCode || 0)` — se `statusCode` não vier (ou vier vazio),
 * `status` fica **0**, e 0 não é 2xx nem 4xx, então cai no rótulo `5xx`.
 *
 * Aqui se reproduz a chamada da fila e se mostra o que o `$http.send` devolve
 * em cada campo, para saber se `statusCode` vem preenchido.
 *
 * GET /backend/v1/check/diag-fila
 */
routerAdd(
  'GET',
  '/backend/v1/check/diag-fila',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true }

    var cx = null
    try {
      const cs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor' && ativo=true && fixture=false && apresentacao_ativa=true",
        '',
        1,
        0,
      )
      if (cs.length > 0) cx = cs[0]
    } catch (e0) {}
    if (!cx) return e.json(200, { ok: false, erro: 'sem vendedor com apresentação' })

    var chave = ''
    try {
      const n = String(cx.get('nome_segredo_chave') || '')
      if (n !== '') chave = String($secrets.get(n) || '')
    } catch (e1) {}

    const sess = String(cx.get('session_id') || '')
    const modelo = String(cx.get('modelo_apresentacao_vendedor') || '')
    out.conexao = {
      nome: String(cx.get('nome_exibicao') || ''),
      modelo: modelo,
      tem_chave: chave !== '',
      sess_len: sess.length,
    }

    // ---------- reproduz a chamada e inspeciona o retorno ----------
    try {
      const resp = $http.send({
        url: 'https://api.d-api.cloud/api/v1/messages/send/template',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: chave },
        body: JSON.stringify({
          sessionId: sess,
          to: '5541999601233',
          template: { name: modelo, language: 'pt_BR', bodyVariables: ['Teste', 'Fábio'] },
        }),
        timeout: 20,
      })

      // o que a fila faz:
      const statusFila = Number(resp.statusCode || 0)

      out.retorno = {
        statusCode: resp.statusCode,
        statusCode_tipo: typeof resp.statusCode,
        status_fila_calcula: statusFila,
        cai_no_ramo_5xx:
          !(statusFila >= 200 && statusFila < 300) &&
          !(statusFila >= 400 && statusFila < 500 && statusFila !== 429),
        tem_body: resp.body !== undefined && resp.body !== null,
        body_tipo: Array.isArray(resp.body) ? 'array' : typeof resp.body,
      }

      var txt = ''
      if (Array.isArray(resp.body)) txt = String.fromCharCode.apply(null, resp.body)
      else if (typeof resp.body === 'string') txt = resp.body
      out.retorno.resposta = txt.replace(/[0-9]{10,}/g, '***').slice(0, 160)
    } catch (e2) {
      out.retorno = { excecao: String(e2).slice(0, 160) }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
