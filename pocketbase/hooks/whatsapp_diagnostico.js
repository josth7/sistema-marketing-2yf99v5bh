/// <reference path="../pb_data/types.d.ts" />
/**
 * Diagnóstico da conexão na D-API (piloto SPEC-3-005).
 *
 * Rota: GET /backend/v1/whatsapp/conexoes/{id}/diagnostico
 *
 * Devolve o que a D-API responde sobre a conexão — inclusive se o webhookUrl
 * está apontado — SEM expor a API Key nem o token: a URL volta mascarada
 * (só o host e os 4 últimos caracteres).
 *
 * Existe porque o dono não tem como conferir isso na tela da D-API sem
 * procurar, e a prova do piloto depende de saber se o webhook está apontado.
 * Só a gestão aciona (mesma regra do configurar-webhook).
 */

routerAdd('GET', '/backend/v1/whatsapp/conexoes/{id}/diagnostico', (e) => {
  const uid = String(e.auth ? e.auth.id : '')
  if (uid === '') return e.json(401, { ok: false, erro: 'sem_sessao' })

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
      if (!Array.isArray(sa) || sa.length === 0 || sa.indexOf('*') >= 0) gestao = true
    }
  } catch (eGr) {}
  if (!gestao) return e.json(403, { ok: false, erro: 'so_gestao_ve_diagnostico' })

  const conexaoId = String(e.request.pathValue('id') || '')
  var conexao = null
  try {
    conexao = $app.findRecordById('whatsapp_conexoes', conexaoId)
  } catch (eC) {
    return e.json(404, { ok: false, erro: 'conexao_nao_encontrada' })
  }
  const sessionId = String(conexao.get('session_id') || '')
  if (sessionId === '') return e.json(422, { ok: false, erro: 'conexao_sem_session_id' })

  const nomeSegredo = String(conexao.get('nome_segredo_chave') || 'DAPI_API_KEY')
  let chave = ''
  try {
    chave = String($secrets.get(nomeSegredo) || '')
  } catch (eSec) {}
  if (chave === '') return e.json(503, { ok: false, erro: 'chave_ausente_no_cofre' })

  var resposta = null
  var corpoResp = ''
  try {
    resposta = $http.send({
      url: 'https://api.d-api.cloud/api/v1/connections/cloud-api/' + sessionId,
      method: 'GET',
      headers: { Authorization: chave, Accept: 'application/json' },
      timeout: 30,
    })
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
  var corpo = {}
  try {
    corpo = JSON.parse(corpoResp)
  } catch (eP) {}

  const dados = corpo.data || corpo
  var urlWebhook = ''
  var modoWebhook = ''
  try {
    // a D-API devolve o webhook dentro de data ou data.webhook
    const raiz = dados || {}
    urlWebhook = String(raiz.webhookUrl || (raiz.webhook && raiz.webhook.url) || '')
    modoWebhook = String(raiz.webhookMode || (raiz.webhook && raiz.webhook.mode) || '')
  } catch (eW) {}

  var mascarada = ''
  if (urlWebhook !== '') {
    const barra = urlWebhook.lastIndexOf('/')
    mascarada =
      barra > 0
        ? urlWebhook.slice(0, urlWebhook.indexOf('/backend') + 1) + '…' + urlWebhook.slice(-4)
        : '••••' + urlWebhook.slice(-4)
  }

  return e.json(200, {
    ok: true,
    status_d_api: status,
    numero: String(conexao.get('numero') || ''),
    nome: String(conexao.get('nome_exibicao') || ''),
    webhook_apontado: urlWebhook !== '',
    webhook_url_mascarada: mascarada,
    webhook_modo: modoWebhook,
    session_id_final: sessionId.slice(-8),
    // devolve as chaves disponíveis para eu saber se o campo veio com outro nome
    campos_disponiveis: Object.keys(dados || {}).slice(0, 30),
  })
})
