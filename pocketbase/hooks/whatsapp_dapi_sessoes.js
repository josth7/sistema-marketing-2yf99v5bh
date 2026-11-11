/// <reference path="../pb_data/types.d.ts" />
/**
 * Lista as sessões da conta na D-API (SPEC-3-005, piloto).
 *
 * Rota: GET /backend/v1/whatsapp/dapi-sessoes
 *
 * **Só LEITURA.** Consulta `GET /api/v1/sessions` da D-API para descobrir quais
 * números já estão conectados e qual é o `sessionId` de cada um. Não cria, não
 * altera e não aponta webhook de nada — a instrução 4 da SPEC proíbe o sistema
 * de mudar a configuração das conexões (quem cola o link é o dono).
 *
 * Serve para não pedir ao dono informação que já existe: se o número do Fábio
 * já está conectado na D-API, o `sessionId` aparece aqui e ele não precisa
 * procurar na tela.
 *
 * Só a gestão aciona. Devolve o telefone mascarado (nunca inteiro) e nunca a
 * API Key. A resposta do `$http.send` vem como array de char-codes no JSVM.
 */

routerAdd('GET', '/backend/v1/whatsapp/dapi-sessoes', (e) => {
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

  // chave: usa a da central (é a mesma conta D-API)
  let chave = ''
  try {
    chave = String($secrets.get('DAPI_KEY_CENTRAL') || '')
  } catch (eSec) {}
  if (chave === '') return e.json(503, { ok: false, erro: 'chave_ausente_no_cofre' })

  var resposta = null
  var corpoResp = ''
  try {
    resposta = $http.send({
      url: 'https://api.d-api.cloud/api/v1/sessions',
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

  var lista = corpo.data || corpo.sessions || corpo
  if (Object.prototype.toString.call(lista) !== '[object Array]') lista = []

  var itens = []
  for (const s of lista) {
    const num = String(s.phoneNumber || s.numero || s.phone || '')
    const id = String(s.sessionId || s.id || s.session_id || '')
    itens.push({
      session_id: id,
      telefone_mascarado: num.length > 8 ? num.slice(0, 4) + '****' + num.slice(-2) : num,
      nome: String(s.name || s.displayName || s.pushName || ''),
      tipo: String(s.type || ''),
      status: String(s.status || s.connectionStatus || ''),
      webhook_apontado: String(s.webhookUrl || '') !== '',
      webhook_modo: String(s.webhookMode || ''),
    })
  }

  return e.json(200, {
    ok: true,
    status_d_api: status,
    total: itens.length,
    itens: itens,
    // se a lista vier vazia, estes campos ajudam a entender o formato
    campos_da_resposta: Object.keys(corpo || {}).slice(0, 20),
  })
})
