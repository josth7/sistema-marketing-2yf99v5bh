/// <reference path="../pb_data/types.d.ts" />
/**
 * Lê os dados de conexões da API Oficial na D-API (SÓ LEITURA — piloto, 29/10).
 *
 * Rota: GET /backend/v1/whatsapp/dapi-cloud-api?ids=a,b,c
 *
 * `GET /api/v1/sessions` lista as sessões mas não traz o número (`profile`
 * vazio) e a rota de LISTAGEM de cloud-api não existe neste plano (404). A
 * rota de UMA conexão existe e traz `displayPhoneNumber` — é assim que eu ligo
 * cada `sessionId` da D-API ao número certo, sem pedir nada ao dono.
 *
 * Só LEITURA: não cria, não altera, não aponta webhook (instrução 4). Só a
 * gestão aciona. Nunca devolve API Key nem accessToken da Meta.
 */

routerAdd('GET', '/backend/v1/whatsapp/dapi-cloud-api', (e) => {
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

  // ids vêm na query (requestURI: e.request.url().rawQuery lança no JSVM)
  var ids = []
  try {
    const uri = String(e.request.requestURI || '')
    const pos = uri.indexOf('ids=')
    if (pos >= 0) {
      const resto = uri.slice(pos + 4)
      const fim = resto.indexOf('&')
      const bruto = fim >= 0 ? resto.slice(0, fim) : resto
      const partes = bruto.split(',')
      for (const p of partes) {
        const limpo = p.trim()
        if (limpo !== '') ids.push(limpo)
      }
    }
  } catch (eQ) {}
  if (ids.length === 0) return e.json(400, { ok: false, erro: 'informe_ids' })

  let chave = ''
  try {
    chave = String($secrets.get('DAPI_KEY_CENTRAL') || '')
  } catch (eSec) {}
  if (chave === '') return e.json(503, { ok: false, erro: 'chave_ausente_no_cofre' })

  var itens = []
  for (const sid of ids) {
    var resposta = null
    var corpoResp = ''
    try {
      resposta = $http.send({
        url: 'https://api.d-api.cloud/api/v1/connections/cloud-api/' + sid,
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
    } catch (eH) {
      itens.push({ session_id: sid, erro: 'falha_http' })
      continue
    }
    const st = Number(resposta ? resposta.statusCode : 0)
    var corpo = {}
    try {
      corpo = JSON.parse(corpoResp)
    } catch (eP) {}
    const dados = corpo.data || corpo
    const num = String(dados.displayPhoneNumber || dados.phoneNumber || dados.phone || '')
    // URL do webhook mascarada: mostra o HOST e os 4 últimos caracteres, para
    // conferir que aponta para o nosso backend sem expor o token (a URL contém
    // o segredo no caminho).
    var urlBruta = String(dados.webhookUrl || '')
    var urlMasc = ''
    if (urlBruta !== '') {
      const corte = urlBruta.indexOf('/backend')
      const cabeca = corte > 0 ? urlBruta.slice(0, corte) : ''
      urlMasc = (cabeca !== '' ? cabeca + '/…' : '…') + urlBruta.slice(-4)
    }
    itens.push({
      session_id: sid,
      status_d_api: st,
      telefone: num,
      telefone_mascarado: num.length > 8 ? num.slice(0, 4) + '****' + num.slice(-2) : num,
      nome_verificado: String(dados.verifiedName || dados.name || ''),
      status: String(dados.status || ''),
      webhook_apontado: urlBruta !== '',
      webhook_url_mascarada: urlMasc,
      webhook_host_correto:
        urlBruta.indexOf('sistema-marketing-1f51e.shrd00.internal.goskip.dev') > 0,
      webhook_rota_correta: urlBruta.indexOf('/backend/v1/whatsapp/dapi/') > 0,
      webhook_modo: String(dados.webhookMode || ''),
      campos: Object.keys(dados || {}).slice(0, 25),
    })
  }

  return e.json(200, { ok: true, total: itens.length, itens: itens })
})
