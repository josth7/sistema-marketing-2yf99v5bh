/// <reference path="../pb_data/types.d.ts" />
/**
 * Rotas de canal — API (SPEC-3-001): GET lista p/ tela + consumir/concluir/erro
 * (assinados). Divisão só para caber no transporte de gravação.
 */

// ==================== GET /backend/v1/analises (lista p/ tela, autenticado) ====================
routerAdd('GET', '/backend/v1/analises', (e) => {
  if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
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
    "user_id='" + e.auth.id + "' && revoked_at='' && action='read_analyses'",
    '',
    50,
    0,
  )
  if (!grants || grants.length === 0) {
    return e.json(403, { ok: false, erro: 'sem permissão de read_analyses' })
  }
  let contasGrant = []
  let temTudo = false
  for (const g of grants) {
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
    if (esc.indexOf('*') >= 0) temTudo = true
    for (const c of esc) contasGrant.push(String(c))
  }
  const colA = app.findCollectionByNameOrId('analyses')
  const registros = app.findRecordsByFilter(colA, '', '-created', 100, 0)
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
