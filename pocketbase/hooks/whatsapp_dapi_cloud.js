/// <reference path="../pb_data/types.d.ts" />
/**
 * Lista as conexões da API Oficial na D-API (SÓ LEITURA — piloto, 29/10).
 *
 * Rota: GET /backend/v1/whatsapp/dapi-cloud-api
 *
 * `GET /api/v1/sessions` devolve as sessões, mas o NÚMERO de cada uma não vem
 * no payload (`profile` vazio). A rota da Cloud API traz o telefone exibido e
 * o `connectionId`, que é o que casa a sessão da D-API com a conexão certa no
 * sistema.
 *
 * Não cria, não altera, não aponta webhook (instrução 4). Só a gestão aciona.
 * A API Key nunca sai daqui; o `accessToken` da Meta também é removido.
 */

routerAdd('GET', '/backend/v1/whatsapp/dapi-cloud-api', (e) => {
  const uid = String(e.auth ? e.auth.id : '')
  if (uid === '') return e.json(401, { ok: false, erro: 'sem_sessao' })

  var gestao = false
  try {
    const colG = $app.findCollectionByNameOrId('access_grants')
    const grants = $app.findRecordsByFilter(
      colG,
      "user_id='" + uid + "' && revoked_at!=''",
      '',
      1,
      0,
    )
    const todos = $app.findRecordsByFilter(
      colG,
      "user_id='" + uid + "' && revoked_at=''",
      '',
      50,
      0,
    )
    for (const g of todos) {
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
      if (!Array.isArray(acts) || acts.indexOf('manage_whatsapp') < 0) continue
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
      if (Array.isArray(sa) && sa.indexOf('*') >= 0) gestao = true
    }
  } catch (eGr) {}
  if (!gestao) return e.json(403, { ok: false, erro: 'so_gestao' })

  let chave = ''
  try {
    chave = String($secrets.get('DAPI_KEY_CENTRAL') || '')
  } catch (eSec) {}
  if (chave === '') return e.json(503, { ok: false, erro: 'chave_ausente_no_cofre' })

  var resposta = null
  var corpoResp = ''
  try {
    resposta = $http.send({
      url: 'https://api.d-api.cloud/api/v1/connections/cloud-api',
      method: 'GET',
      headers: { Authorization: chave, Accept: 'application/json' },
      timeout: 30,
    })
    var bruto = resposta.body
    if (Object.prototype.toString.call(bruto) === '[object Array]') {
      corpoResp =
        bruto.length > 0 && typeof bruto[0] === 'number'
          ? String.fromCharCode.apply(null, bruto)
          : JSON.stringify(bruto)
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
  var corpo = {}
  try {
    corpo = JSON.parse(corpoResp)
  } catch (eP) {}

  var lista = corpo.data || corpo.connections || corpo
  if (Object.prototype.toString.call(lista) !== '[object Array]') lista = []

  var itens = []
  for (const c of lista) {
    var num = String(c.displayPhoneNumber || c.phoneNumber || c.phone || '')
    // nunca devolver o access token da Meta nem a apiKey
    itens.push({
      connection_id: String(c.connectionId || c.id || ''),
      session_id: String(c.sessionId || c.id || ''),
      telefone: num,
      telefone_mascarado: num.length > 8 ? num.slice(0, 4) + '****' + num.slice(-2) : num,
      nome_verificado: String(c.verifiedName || c.name || ''),
      status: String(c.status || ''),
      webhook_apontado: String(c.webhookUrl || '') !== '',
      webhook_modo: String(c.webhookMode || ''),
    })
  }

  return e.json(200, {
    ok: true,
    status_d_api: status,
    total: itens.length,
    itens: itens,
    campos_da_resposta: Object.keys(corpo || {}).slice(0, 20),
  })
})
