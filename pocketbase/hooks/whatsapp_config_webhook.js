/// <reference path="../pb_data/types.d.ts" />
/**
 * Configura o webhook da conexão na D-API (SPEC-3-005, piloto).
 *
 * Rota: POST /backend/v1/whatsapp/conexoes/{id}/configurar-webhook
 *
 * Existe porque o dono não tem como colar a URL (ele tentou abrir no navegador
 * e recebeu 404 — o navegador faz GET, a rota do webhook é POST-only). Em vez
 * de pedir para ele colar, o sistema configura por API: a API Key fica no
 * cofre e nunca passa por arquivo, chat, repositório ou tela.
 *
 * Usa `PATCH /api/v1/connections/cloud-api/{id}` da D-API (documentação:
 * api-reference/cloud-api/atualizar-conexão-cloud_api.md), que aceita
 * `webhookUrl` e `webhookMode`. Modo `normalized` = eventos canônicos da D-API,
 * que é o formato que a nossa rota do webhook trata.
 *
 * Só a gestão aciona (tem `read_conversas` com escopo todos, RN-87): mudar o
 * roteamento do webhook de um número não é ação de vendedor.
 */

routerAdd('POST', '/backend/v1/whatsapp/conexoes/{id}/configurar-webhook', (e) => {
  // ---------- 1. quem pede ----------
  const uid = String(e.auth ? e.auth.id : '')
  if (uid === '') return e.json(401, { ok: false, erro: 'sem_sessao' })

  var emailAuth = ''
  try {
    emailAuth = String($app.findRecordById('users', uid).get('email') || '').toLowerCase()
  } catch (eEm) {}

  var gestao = false
  try {
    const colG = $app.findCollectionByNameOrId('access_grants')
    const grants = $app.findRecordsByFilter(
      colG,
      "user_id='" + uid + "' && revoked_at=''",
      '',
      50,
      0,
    )
    const hoje = new Date().toISOString().slice(0, 10)
    for (const g of grants) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
      if (ate !== '' && ate.slice(0, 10) < hoje) continue
      var acts = []
      try {
        const raw = g.get('actions')
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          acts = JSON.parse(String.fromCharCode.apply(null, raw))
        } else if (typeof raw === 'string') {
          acts = JSON.parse(raw)
        } else {
          acts = raw || []
        }
      } catch (eA) {}
      if (!Array.isArray(acts) || acts.indexOf('read_conversas') < 0) continue
      var sa = []
      try {
        const rawS = g.get('scope_accounts')
        if (Array.isArray(rawS) && rawS.length > 0 && typeof rawS[0] === 'number') {
          sa = JSON.parse(String.fromCharCode.apply(null, rawS))
        } else if (typeof rawS === 'string') {
          sa = JSON.parse(rawS)
        } else {
          sa = rawS || []
        }
      } catch (eS) {}
      // escopo vazio NÃO é gestão: só '*' vê tudo
      if (Array.isArray(sa) && sa.indexOf('*') >= 0) gestao = true
    }
  } catch (eGr) {}
  if (!gestao) return e.json(403, { ok: false, erro: 'so_gestao_configura_webhook' })

  // ---------- 2. conexão ----------
  const conexaoId = String(e.request.pathValue('id') || '')
  if (conexaoId === '') return e.json(400, { ok: false, erro: 'conexao_obrigatoria' })
  var conexao = null
  try {
    conexao = $app.findRecordById('whatsapp_conexoes', conexaoId)
  } catch (eC) {
    return e.json(404, { ok: false, erro: 'conexao_nao_encontrada' })
  }

  const sessionId = String(conexao.get('session_id') || '')
  if (sessionId === '') {
    return e.json(422, { ok: false, erro: 'conexao_sem_session_id' })
  }

  // ---------- 3. segredos ----------
  const nomeSegredo = String(conexao.get('nome_segredo_chave') || 'DAPI_API_KEY')
  let chave = ''
  try {
    chave = String($secrets.get(nomeSegredo) || '')
  } catch (eSec) {}
  if (chave === '') return e.json(503, { ok: false, erro: 'chave_ausente_no_cofre:' + nomeSegredo })

  const tokenWebhook = String($secrets.get('DAPI_WEBHOOK_TOKEN') || '')
  if (tokenWebhook === '') return e.json(503, { ok: false, erro: 'webhook_token_ausente' })

  // A URL que a D-API vai chamar. Host do backend de PRODUÇÃO (o .goskip.app
  // serve só o frontend e devolve 405 em POST — foi provado em 28/10).
  const base = 'https://sistema-marketing-1f51e.shrd00.internal.goskip.dev'
  const url = base + '/backend/v1/whatsapp/dapi/' + tokenWebhook

  // ---------- 4. PATCH na D-API ----------
  const corpo = JSON.stringify({ webhookUrl: url, webhookMode: 'normalized' })
  var resposta = null
  var corpoResp = ''
  try {
    resposta = $http.send({
      url: 'https://api.d-api.cloud/api/v1/connections/cloud-api/' + sessionId,
      method: 'PATCH',
      headers: { Authorization: chave, 'Content-Type': 'application/json' },
      body: corpo,
      timeout: 30,
    })
    // corpo do $http.send volta como ARRAY DE CHAR-CODES no JSVM
    var bruto = resposta.body
    if (Object.prototype.toString.call(bruto) === '[object Array]') {
      if (bruto.length > 0 && typeof bruto[0] === 'number') {
        corpoResp = String.fromCharCode.apply(null, bruto)
      } else {
        corpoResp = JSON.stringify(bruto)
      }
    } else if (typeof bruto === 'string') {
      corpoResp = bruto
    } else if (bruto) {
      corpoResp = JSON.stringify(bruto)
    }
  } catch (eHttp) {
    return e.json(502, {
      ok: false,
      erro: 'falha_ao_chamar_d_api',
      detalhe: String(eHttp).slice(0, 200),
    })
  }

  const status = Number(resposta ? resposta.statusCode : 0)
  const deuCerto = status >= 200 && status < 300

  // registro do que aconteceu (sem a chave, sem o token)
  try {
    const colSin = $app.findCollectionByNameOrId('whatsapp_sinais')
    var sinais = []
    try {
      sinais = $app.findRecordsByFilter(colSin, "conexao='" + conexao.id + "'", '', 1, 0)
    } catch (eSin) {}
    if (sinais && sinais.length > 0) {
      sinais[0].set('ultima_em', new Date().toISOString())
      $app.save(sinais[0])
    }
  } catch (eR) {}

  if (!deuCerto) {
    return e.json(502, {
      ok: false,
      erro: 'd_api_recusou',
      status: status,
      resposta: corpoResp.slice(0, 400),
    })
  }

  // guarda que a URL foi apontada (o valor do token não fica aqui)
  try {
    conexao.set('webhook_apontado_em', new Date().toISOString())
    $app.save(conexao)
  } catch (eCx) {}

  return e.json(200, {
    ok: true,
    url_configurada: url.slice(0, url.lastIndexOf('/') + 1) + '••••' + tokenWebhook.slice(-4),
    modo: 'normalized',
    status_d_api: status,
  })
})
