/// <reference path="../pb_data/types.d.ts" />
/**
 * Detalhe de uma sessão na D-API (SÓ LEITURA — piloto, 29/10).
 *
 * Rota: GET /backend/v1/whatsapp/dapi-sessoes/{sessionId}
 *
 * Consulta `GET /api/v1/sessions/{sessionId}` (ou o endpoint de dados da
 * sessão) para descobrir o NÚMERO daquela sessão — é assim que eu ligo a
 * sessão da D-API à conexão certa no sistema sem pedir nada ao dono.
 *
 * Não cria, não altera, não aponta webhook (instrução 4). Só a gestão aciona.
 * Nunca devolve a API Key.
 */

routerAdd('GET', '/backend/v1/whatsapp/dapi-sessoes/{sid}', (e) => {
  // ---------- empresa ativa (CA-3-88) ----------
  // Lê os grants AQUI, no escopo da rota: `const meus` de dentro de um try
  // não existe fora dele (lança, o catch engole, o 403 não dispara).
  var empresaAtiva = ''
  try {
    var pedidaW = String(e.request.header.get('X-Empresa') || '')
    var gsW = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('access_grants'),
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '',
      60,
      0,
    )
    var empGrantW = []
    var ehDonoW = false
    for (const gW of gsW) {
      var empGW = ''
      try {
        empGW = String(gW.get('empresa') || '')
      } catch (eGW) {}
      if (empGW !== '' && empGrantW.indexOf(empGW) < 0) empGrantW.push(empGW)
      var saW = []
      try {
        var rawW = gW.get('scope_accounts')
        saW =
          Array.isArray(rawW) && rawW.length > 0 && typeof rawW[0] === 'number'
            ? JSON.parse(String.fromCharCode.apply(null, rawW))
            : typeof rawW === 'string'
              ? JSON.parse(rawW)
              : rawW || []
      } catch (eSAW) {}
      if (Array.isArray(saW) && saW.indexOf('*') >= 0) ehDonoW = true
    }
    if (pedidaW !== '') {
      if (!ehDonoW && empGrantW.indexOf(pedidaW) < 0) {
        return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
      }
      empresaAtiva = pedidaW
    } else if (empGrantW.length > 0) {
      empresaAtiva = empGrantW[0]
    } else {
      const esW = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
      if (esW.length > 0) empresaAtiva = esW[0].id
    }
  } catch (eEmpW) {}

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
    for (const g of grants) {
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

  const sid = String(e.request.pathValue('sid') || '')
  if (sid === '') return e.json(400, { ok: false, erro: 'session_obrigatoria' })

  let chave = ''
  try {
    chave = String($secrets.get('DAPI_KEY_CENTRAL') || '')
  } catch (eSec) {}
  if (chave === '') return e.json(503, { ok: false, erro: 'chave_ausente_no_cofre' })

  var resposta = null
  var corpoResp = ''
  try {
    resposta = $http.send({
      url: 'https://api.d-api.cloud/api/v1/sessions/' + sid,
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

  // A D-API devolve { session, pod, profile } (ou { success, error }).
  // `profile` traz o número conectado; `session` traz o estado.
  const dados = corpo.data || corpo
  const sessao = dados.session || {}
  const perfil = dados.profile || {}
  // nunca devolver a API Key nem o token do webhook
  var urlW = String(dados.webhookUrl || '')
  var mascW = ''
  if (urlW !== '') {
    const i = urlW.indexOf('/backend')
    mascW = (i > 0 ? urlW.slice(0, i + 1) + '…' : '') + urlW.slice(-4)
  }

  return e.json(200, {
    ok: true,
    status_d_api: status,
    session_id: sid,
    numero: String(
      perfil.phoneNumber ||
        perfil.phone ||
        perfil.number ||
        sessao.phoneNumber ||
        dados.phoneNumber ||
        '',
    ),
    nome: String(perfil.name || perfil.pushName || perfil.displayName || dados.name || ''),
    status_sessao: String(sessao.status || dados.status || dados.connectionStatus || ''),
    webhook_apontado: urlW !== '',
    webhook_modo: String(dados.webhookMode || ''),
    webhook_final: mascW,
    campos: Object.keys(dados || {}).slice(0, 30),
    campos_sessao: Object.keys(sessao || {}).slice(0, 25),
    campos_perfil: Object.keys(perfil || {}).slice(0, 25),
  })
})
