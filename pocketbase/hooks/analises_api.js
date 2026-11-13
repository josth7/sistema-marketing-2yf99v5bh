/// <reference path="../pb_data/types.d.ts" />
/**
 * Rotas de canal — API (SPEC-3-001): GET lista p/ tela + consumir/concluir/erro
 * (assinados). Divisão só para caber no transporte de gravação.
 */

// ==================== GET /backend/v1/analises (lista p/ tela, autenticado) ====================
routerAdd('GET', '/backend/v1/analises', (e) => {
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

  if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

  // 13/11 (vazamento Gol 7): só o dono troca de empresa pelo header
  try {
    const emD = String(e.auth.get('email') || '').toLowerCase()
    const donoD = emD === 'anezia@haisan.com.br' || emD.indexOf('josth') >= 0
    if (!donoD && empresaAtiva !== '' && empGrantW.indexOf(empresaAtiva) < 0) {
      return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
    }
  } catch (eDn) {}
  if (empresaAtiva === '') {
    return e.json(403, { ok: false, erro: 'sem empresa definida para este acesso' })
  }
  const app = $app
  const parseTol = function (raw) {
    try {
      if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number')
        return JSON.parse(String.fromCharCode.apply(null, raw))
      if (typeof raw === 'string') return raw === '' ? null : JSON.parse(raw)
      return raw || null
    } catch (eP) {
      return null
    }
  }
  // ---- escopo do grant read_analises ----
  const colG = app.findCollectionByNameOrId('access_grants')
  const grants = app.findRecordsByFilter(
    colG,
    "user_id='" + e.auth.id + "' && revoked_at=''",
    '',
    50,
    0,
  )
  let contasGrant = []
  let temTudo = false
  for (const g of grants) {
    let acoes = []
    try {
      const rawA = g.get('actions')
      acoes =
        Array.isArray(rawA) && rawA.length > 0 && typeof rawA[0] === 'number'
          ? JSON.parse(String.fromCharCode.apply(null, rawA))
          : typeof rawA === 'string'
            ? JSON.parse(rawA)
            : rawA || []
    } catch (eA) {}
    if (Array.isArray(acoes) && acoes.indexOf('read_analyses') < 0) continue
    let esc = []
    try {
      const raw = g.get('scope_accounts')
      esc =
        Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number'
          ? JSON.parse(String.fromCharCode.apply(null, raw))
          : typeof raw === 'string'
            ? JSON.parse(raw)
            : raw || []
    } catch (eS2) {}
    if (!Array.isArray(esc)) esc = []
    // escopo vazio = grant de bootstrap sem restrição (ex.: dono, fase 3) — acesso total
    if (esc.length === 0) temTudo = true
    if (esc.indexOf('*') >= 0) temTudo = true
    for (const c of esc) contasGrant.push(String(c))
  }
  if (!temTudo && contasGrant.length === 0) {
    return e.json(403, { ok: false, erro: 'sem permissão de read_analyses' })
  }
  const colA = app.findCollectionByNameOrId('analyses')
  // 13/11: antes listava as análises de TODAS as empresas
  const registros = app.findRecordsByFilter(
    colA,
    "empresa='" + String(empresaAtiva).replace(/'/g, '') + "'",
    '-created',
    100,
    0,
  )
  const itens = []
  for (const a of registros) {
    if (!temTudo) {
      const alvo = String(a.get('alvo_ref') || '')
      let dentro = false
      for (const c of contasGrant) {
        if (alvo.indexOf(c) >= 0) dentro = true
      }
      // análises sem alvo (diagnóstico do período) seguem visíveis
      if (alvo === '' || dentro) {
        // visível
      } else {
        continue
      }
    }
    itens.push({
      id: a.id,
      uuid: a.get('uuid'),
      event_id: a.get('event_id'),
      tipo: a.get('tipo'),
      alvo_ref: a.get('alvo_ref'),
      period_start: a.get('period_start'),
      period_end: a.get('period_end'),
      conteudo: a.get('conteudo'),
      evidencias: parseTol(a.get('evidencias')),
      modelo: a.get('modelo'),
      gerado_em: a.get('gerado_em'),
      origem: a.get('origem'),
      estado: a.get('estado'),
      versao: a.get('versao'),
      fixture: a.get('fixture') === true,
    })
  }
  return e.json(200, { ok: true, itens: itens })
})

// ==================== POST /backend/v1/analises/eventos/{id}/consumir (assinado) ====================
routerAdd('POST', '/backend/v1/analises/eventos/{id}/consumir', (e) => {
  const app = $app
  const colC = app.findCollectionByNameOrId('canal_estado')
  let canal = null
  const recsC = app.findRecordsByFilter(colC, '', '', 1, 0)
  if (recsC && recsC.length > 0) canal = recsC[0]
  let seg = ''
  try {
    const v = $secrets.get('MAESTRO_SHARED_SECRET')
    if (v) seg = String(v)
  } catch (eS) {}
  if (!seg && canal) seg = String(canal.get('segredo_teste') || '')
  if (!seg) return e.json(503, { ok: false, erro: 'canal_indisponivel' })
  const tsHeader = String(e.request.header.get('X-Maestro-Timestamp') || '')
  const sigHeader = String(e.request.header.get('X-Maestro-Signature') || '')
  const agora = Math.floor(Date.now() / 1000)
  const ts = Number(tsHeader)
  if (!tsHeader || !Number.isFinite(ts) || Math.abs(agora - ts) > 300) {
    return e.json(401, { ok: false, erro: 'timestamp ausente ou fora da janela de 300s' })
  }
  const requestURI = String(e.request.requestURI || '')
  const posQ = requestURI.indexOf('?')
  const query = posQ >= 0 ? requestURI.slice(posQ + 1) : ''
  const caminho = requestURI.split('?')[0]
  const material = tsHeader + '.POST.' + caminho + '.' + query
  const esperada = $security.hs256(material, seg)
  let igual = false
  try {
    igual = $security.equal(esperada, sigHeader)
  } catch (eEq) {
    if (esperada.length === sigHeader.length) {
      let diff = 0
      for (let i = 0; i < esperada.length; i++) {
        diff |= esperada.charCodeAt(i) ^ sigHeader.charCodeAt(i)
      }
      igual = diff === 0
    }
  }
  if (!igual) return e.json(401, { ok: false, erro: 'assinatura inválida' })
  if (canal) {
    canal.set('ultimo_consumo_em', new Date().toISOString())
    canal.set('ciclos_sem_consumo', 0)
    canal.set('atualizado_em', new Date().toISOString())
    app.save(canal)
  }
  const id = e.request.pathValue('id')
  let ev
  try {
    ev = app.findRecordById('analysis_events', id)
  } catch (_) {
    return e.json(404, { ok: false, erro: 'evento não encontrado' })
  }
  const estado = String(ev.get('estado') || '')
  if (estado === 'entregue') {
    return e.json(200, { ok: true, replay: true, estado: 'entregue' })
  }
  if (estado !== 'pendente' && estado !== 'erro') {
    return e.json(409, { ok: false, erro: 'evento em estado ' + estado + ' — não consumível' })
  }
  ev.set('estado', 'entregue')
  ev.set('tentativas', Number(ev.get('tentativas') || 0) + 1)
  ev.set('entregue_em', new Date().toISOString())
  app.save(ev)
  return e.json(200, { ok: true, replay: false, estado: 'entregue' })
})

// ==================== POST /backend/v1/analises/eventos/{id}/concluir (assinado) ====================
routerAdd('POST', '/backend/v1/analises/eventos/{id}/concluir', (e) => {
  const app = $app
  const colC = app.findCollectionByNameOrId('canal_estado')
  let canal = null
  const recsC = app.findRecordsByFilter(colC, '', '', 1, 0)
  if (recsC && recsC.length > 0) canal = recsC[0]
  let seg = ''
  try {
    const v = $secrets.get('MAESTRO_SHARED_SECRET')
    if (v) seg = String(v)
  } catch (eS) {}
  if (!seg && canal) seg = String(canal.get('segredo_teste') || '')
  if (!seg) return e.json(503, { ok: false, erro: 'canal_indisponivel' })
  const tsHeader = String(e.request.header.get('X-Maestro-Timestamp') || '')
  const sigHeader = String(e.request.header.get('X-Maestro-Signature') || '')
  const agora = Math.floor(Date.now() / 1000)
  const ts = Number(tsHeader)
  if (!tsHeader || !Number.isFinite(ts) || Math.abs(agora - ts) > 300) {
    return e.json(401, { ok: false, erro: 'timestamp ausente ou fora da janela de 300s' })
  }
  const requestURI = String(e.request.requestURI || '')
  const posQ = requestURI.indexOf('?')
  const query = posQ >= 0 ? requestURI.slice(posQ + 1) : ''
  const caminho = requestURI.split('?')[0]
  const material = tsHeader + '.POST.' + caminho + '.' + query
  const esperada = $security.hs256(material, seg)
  let igual = false
  try {
    igual = $security.equal(esperada, sigHeader)
  } catch (eEq) {
    if (esperada.length === sigHeader.length) {
      let diff = 0
      for (let i = 0; i < esperada.length; i++) {
        diff |= esperada.charCodeAt(i) ^ sigHeader.charCodeAt(i)
      }
      igual = diff === 0
    }
  }
  if (!igual) return e.json(401, { ok: false, erro: 'assinatura inválida' })
  if (canal) {
    canal.set('ultimo_consumo_em', new Date().toISOString())
    canal.set('ciclos_sem_consumo', 0)
    canal.set('atualizado_em', new Date().toISOString())
    app.save(canal)
  }
  const id = e.request.pathValue('id')
  let ev
  try {
    ev = app.findRecordById('analysis_events', id)
  } catch (_) {
    return e.json(404, { ok: false, erro: 'evento não encontrado' })
  }
  const estado = String(ev.get('estado') || '')
  if (estado === 'concluido') {
    return e.json(200, { ok: true, replay: true, estado: 'concluido' })
  }
  if (estado !== 'entregue') {
    return e.json(409, { ok: false, erro: 'evento em estado ' + estado + ' — só entregue conclui' })
  }
  ev.set('estado', 'concluido')
  ev.set('concluido_em', new Date().toISOString())
  app.save(ev)
  return e.json(200, { ok: true, replay: false, estado: 'concluido' })
})

// ==================== POST /backend/v1/analises/eventos/{id}/erro (assinado) ====================
routerAdd('POST', '/backend/v1/analises/eventos/{id}/erro', (e) => {
  const app = $app
  const colC = app.findCollectionByNameOrId('canal_estado')
  let canal = null
  const recsC = app.findRecordsByFilter(colC, '', '', 1, 0)
  if (recsC && recsC.length > 0) canal = recsC[0]
  let seg = ''
  try {
    const v = $secrets.get('MAESTRO_SHARED_SECRET')
    if (v) seg = String(v)
  } catch (eS) {}
  if (!seg && canal) seg = String(canal.get('segredo_teste') || '')
  if (!seg) return e.json(503, { ok: false, erro: 'canal_indisponivel' })
  const tsHeader = String(e.request.header.get('X-Maestro-Timestamp') || '')
  const sigHeader = String(e.request.header.get('X-Maestro-Signature') || '')
  const agora = Math.floor(Date.now() / 1000)
  const ts = Number(tsHeader)
  if (!tsHeader || !Number.isFinite(ts) || Math.abs(agora - ts) > 300) {
    return e.json(401, { ok: false, erro: 'timestamp ausente ou fora da janela de 300s' })
  }
  const requestURI = String(e.request.requestURI || '')
  const posQ = requestURI.indexOf('?')
  const query = posQ >= 0 ? requestURI.slice(posQ + 1) : ''
  const caminho = requestURI.split('?')[0]
  const material = tsHeader + '.POST.' + caminho + '.' + query
  const esperada = $security.hs256(material, seg)
  let igual = false
  try {
    igual = $security.equal(esperada, sigHeader)
  } catch (eEq) {
    if (esperada.length === sigHeader.length) {
      let diff = 0
      for (let i = 0; i < esperada.length; i++) {
        diff |= esperada.charCodeAt(i) ^ sigHeader.charCodeAt(i)
      }
      igual = diff === 0
    }
  }
  if (!igual) return e.json(401, { ok: false, erro: 'assinatura inválida' })
  if (canal) {
    canal.set('ultimo_consumo_em', new Date().toISOString())
    canal.set('ciclos_sem_consumo', 0)
    canal.set('atualizado_em', new Date().toISOString())
    app.save(canal)
  }
  const id = e.request.pathValue('id')
  let ev
  try {
    ev = app.findRecordById('analysis_events', id)
  } catch (_) {
    return e.json(404, { ok: false, erro: 'evento não encontrado' })
  }
  const body = e.requestInfo().body || {}
  const motivo = String(body.motivo || 'erro não especificado').slice(0, 200)
  const tent = Number(ev.get('tentativas') || 0) + 1
  ev.set('tentativas', tent)
  ev.set('ultimo_erro', motivo)
  if (tent >= 3) {
    ev.set('estado', 'erro_definitivo')
  } else {
    ev.set('estado', 'erro')
  }
  app.save(ev)
  return e.json(200, { ok: true, tentativas: tent, estado: ev.get('estado') })
})
