/// <reference path="../pb_data/types.d.ts" />
/**
 * Hooks do canal - parte 2b (SPEC-3-001: fixtures de canal + RN-07 pedido
 * manual). Mesmo comportamento do arquivo original; divisão só para caber no
 * transporte de gravação. As rotas são registradas por routerAdd em qualquer
 * arquivo do diretório hooks/.
 */

// ==================== POST /backend/v1/fixtures/push ====================
routerAdd('POST', '/backend/v1/fixtures/push', (e) => {
  const esperado = (function () {
    try {
      const v = $secrets.get('FIXTURE_TICK_SECRET')
      return v ? String(v) : ''
    } catch (eS) {
      return ''
    }
  })()
  const recebido = String(e.request.header.get('X-Fixture-Secret') || '')
  if (esperado === '' || recebido === '' || esperado !== recebido) {
    return e.json(404, { ok: false, erro: 'rota não encontrada' })
  }
  const app = $app
  const body = e.requestInfo().body || {}
  const colE = app.findCollectionByNameOrId('analysis_events')
  const ev = new Record(colE)
  const agoraISO = new Date().toISOString()
  ev.set(
    'uuid',
    'evt-fix-' + agoraISO.replace(/[-:TZ.]/g, '') + '-' + Math.floor(Math.random() * 900 + 100),
  )
  ev.set('origem', String(body.origem || 'push_fixture'))
  ev.set(
    'uuid',
    'evt-fix-' +
      new Date().toISOString().replace(/[-:TZ.]/g, '') +
      '-' +
      Math.floor(Math.random() * 900 + 100),
  )
  ev.set('tipo', String(body.tipo || 'diagnostico_periodo'))
  ev.set('period_start', String(body.period_start || '2026-10-01'))
  ev.set('period_end', String(body.period_end || '2026-10-15'))
  ev.set('scope', body.scope || JSON.stringify({ contas: [], canais: [] }))
  ev.set('tipos_esperados', body.tipos_esperados || JSON.stringify(['diagnostico_periodo']))
  ev.set('payload_resumo', body.payload_resumo || JSON.stringify({ fixture: true }))
  ev.set('instrucoes', String(body.instrucoes || ''))
  ev.set('dados_parciais', body.dados_parciais === true)
  ev.set('estado', 'pendente')
  ev.set('dedupe_key', 'push-' + agoraISO)
  ev.set('created_by', 'system')
  ev.set('fixture', true)
  app.save(ev)
  return e.json(200, { ok: true, event_id: ev.id })
})

// ==================== POST /backend/v1/fixtures/seed-resumo (SPEC-3-003: relógio de teste) ====================
// Cria resumo fixture com prazo customizado (prova RN-25 prazo vencido) ou estado custom.
routerAdd('POST', '/backend/v1/fixtures/seed-resumo', (e) => {
  const esperado = (function () {
    try {
      const v = $secrets.get('FIXTURE_TICK_SECRET')
      return v ? String(v) : ''
    } catch (eS) {
      return ''
    }
  })()
  const recebido = String(e.request.header.get('X-Fixture-Secret') || '')
  if (esperado === '' || recebido === '' || esperado !== recebido) {
    return e.json(404, { ok: false, erro: 'rota não encontrada' })
  }
  const app = $app
  const body = e.requestInfo().body || {}
  const colS = app.findCollectionByNameOrId('report_ai_summaries')
  const agoraISO = new Date().toISOString()
  const sum = new Record(colS)
  sum.set(
    'uuid',
    'sum-fix-' + agoraISO.replace(/[-:TZ.]/g, '') + '-' + Math.floor(Math.random() * 900 + 100),
  )
  sum.set('report_id', String(body.report_id || ''))
  sum.set('estado', String(body.estado || 'aguardando_revisao'))
  sum.set('rascunho', String(body.rascunho || 'Resumo fixture para prova de prazo.'))
  sum.set('prazo_revisao_em', String(body.prazo_revisao_em || agoraISO))
  sum.set('fixture', true)
  app.save(sum)
  return e.json(200, { ok: true, summary_id: sum.id })
})

// ==================== GET /backend/v1/fixtures/canal-estado (teste) ====================
routerAdd('GET', '/backend/v1/fixtures/canal-estado', (e) => {
  const esperado = (function () {
    try {
      const v = $secrets.get('FIXTURE_TICK_SECRET')
      return v ? String(v) : ''
    } catch (eS) {
      return ''
    }
  })()
  const recebido = String(e.request.header.get('X-Fixture-Secret') || '')
  if (esperado === '' || recebido === '' || esperado !== recebido) {
    return e.json(404, { ok: false, erro: 'rota não encontrada' })
  }
  const app = $app
  const colC = app.findCollectionByNameOrId('canal_estado')
  const recs = app.findRecordsByFilter(colC, '', '', 1, 0)
  if (!recs || recs.length === 0) return e.json(200, { ok: true, canal: null })
  const c = recs[0]
  return e.json(200, {
    ok: true,
    canal: {
      segredo_configurado: c.get('segredo_configurado') === true,
      ultimo_consumo_em: c.get('ultimo_consumo_em') || null,
      ciclos_sem_consumo: Number(c.get('ciclos_sem_consumo') || 0),
      recusas_401_total: Number(c.get('recusas_401_total') || 0),
      recusas_401_ultimas_24h: Number(c.get('recusas_401_ultimas_24h') || 0),
      ultimo_motivo: c.get('ultimo_motivo') || null,
      atualizado_em: c.get('atualizado_em') || null,
    },
  })
})

// ==================== POST /backend/v1/analises/eventos (RN-07 pedido manual) ====================
routerAdd('POST', '/backend/v1/analises/eventos', (e) => {
  if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
  const app = $app
  const body = e.requestInfo().body || {}
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
  // ---- grant request_analysis + escopo ----
  const colG = app.findCollectionByNameOrId('access_grants')
  const todosGrants = app.findRecordsByFilter(
    colG,
    "user_id='" + e.auth.id + "' && revoked_at=''",
    '',
    50,
    0,
  )
  const grants = []
  for (const g0 of todosGrants) {
    let acts0 = []
    try {
      const raw0 = g0.get('actions')
      if (Array.isArray(raw0) && raw0.length > 0 && typeof raw0[0] === 'number') {
        acts0 = JSON.parse(String.fromCharCode.apply(null, raw0))
      } else if (typeof raw0 === 'string') {
        acts0 = JSON.parse(raw0)
      } else {
        acts0 = raw0 || []
      }
    } catch (eA0) {}
    if (acts0.indexOf('request_analysis') >= 0) grants.push(g0)
  }
  if (grants.length === 0) {
    return e.json(403, { ok: false, erro: 'sem permissão de request_analysis' })
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
  // ---- período: último período fechado (padrão) ou explícito ----
  const hoje = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const dia = Number(hoje.slice(8, 10))
  let inicio = String(body.period_start || '')
  let fim = String(body.period_end || '')
  if (!/^\d{4}-\d{2}-\d{2}$/.test(inicio) || !/^\d{4}-\d{2}-\d{2}$/.test(fim)) {
    if (dia >= 16) {
      inicio = hoje.slice(0, 7) + '-01'
      fim = hoje.slice(0, 7) + '-15'
    } else {
      const pAno = Number(hoje.slice(0, 4))
      const pMes = Number(hoje.slice(5, 7))
      const a2 = pMes === 1 ? pAno - 1 : pAno
      const m2 = pMes === 1 ? 12 : pMes - 1
      const m2s = (m2 < 10 ? '0' : '') + m2
      inicio = a2 + '-' + m2s + '-16'
      fim = new Date(Date.UTC(a2, m2, 1) - 86400000).toISOString().slice(0, 10)
    }
  }
  if (fim >= hoje) {
    return e.json(422, {
      ok: false,
      erro: 'período em curso — só período fechado',
      campos: { period_end: 'data futura ou em curso' },
    })
  }
  // ---- replay idempotente ----
  const dedupe = 'manual-' + e.auth.id + '-' + inicio + '-' + fim
  const colEv = app.findCollectionByNameOrId('analysis_events')
  const exEv = app.findRecordsByFilter(colEv, "dedupe_key='" + dedupe + "'", '', 1, 0)
  if (exEv && exEv.length > 0) {
    const evR = exEv[0]
    return e.json(200, {
      ok: true,
      replay: true,
      event_id: evR.id,
      evento: {
        period_start: evR.get('period_start'),
        period_end: evR.get('period_end'),
        dados_parciais: evR.get('dados_parciais') === true,
        motivo_parcial: evR.get('motivo_parcial') || null,
      },
    })
  }
  // ---- teto mensal de pedidos manuais ----
  const colPol = app.findCollectionByNameOrId('analysis_policy')
  const pols = app.findRecordsByFilter(colPol, 'fixture=false', '', 1, 0)
  const pol = pols && pols.length > 0 ? pols[0] : null
  const teto = pol ? Number(pol.get('max_pedidos_manuais_mes') || 4) : 4
  const mesRef = hoje.slice(0, 7)
  const manuaisMes = app.findRecordsByFilter(
    colEv,
    "dedupe_key~'manual-' && created >= '" + mesRef + "-01'",
    '',
    200,
    0,
  )
  if (manuaisMes && manuaisMes.length >= teto) {
    return e.json(422, {
      ok: false,
      erro: 'teto mensal de pedidos manuais atingido (' + teto + ')',
    })
  }
  // ---- cobertura (dados_parciais com motivo) ----
  const diasPeriodo =
    Math.round(
      (new Date(fim + 'T00:00:00Z').getTime() - new Date(inicio + 'T00:00:00Z').getTime()) /
        86400000,
    ) + 1
  const colM = app.findCollectionByNameOrId('metricas_fixtures')
  const porCanal = {}
  try {
    const regs = app.findRecordsByFilter(
      colM,
      "data >= '" + inicio + "' && data <= '" + fim + " 23:59:59.999Z'",
      'data',
      2000,
      0,
    )
    for (const r of regs) {
      const c = String(r.get('canal') || '')
      if (!porCanal[c]) porCanal[c] = {}
      porCanal[c][String(r.get('data') || '').slice(0, 10)] = true
    }
  } catch (eM2) {}
  const cobertura = {}
  const faltas = []
  for (const canal2 of ['meta_ads', 'google_ads']) {
    const dias2 = porCanal[canal2] ? Object.keys(porCanal[canal2]).length : 0
    cobertura[canal2] = { dias: dias2, completo: dias2 === diasPeriodo }
    if (dias2 < diasPeriodo) faltas.push(canal2 + ' ' + dias2 + '/' + diasPeriodo)
  }
  const parcial = faltas.length > 0
  const motivoParcial = parcial ? 'cobertura incompleta — ' + faltas.join(', ') : ''
  // ---- cria o evento ----
  const agoraISO = new Date().toISOString()
  const ev = new Record(colEv)
  ev.set(
    'uuid',
    'evt-' + agoraISO.replace(/[-:TZ.]/g, '') + '-' + Math.floor(Math.random() * 900 + 100),
  )
  ev.set('tipo', 'periodo_fechado')
  ev.set('origem', 'solicitacao_manual')
  // gatilho_ref = uuid do relatório mais recente da quinzena (se existir) —
  // permite o resumo_relatorio com alvo_ref = gatilho_ref (SPEC-3-003)
  try {
    const colR7 = app.findCollectionByNameOrId('reports')
    const rs7 = app.findRecordsByFilter(
      colR7,
      "period_start='" + inicio + "' && period_end='" + fim + "'",
      '-created',
      1,
      0,
    )
    if (rs7 && rs7.length > 0) ev.set('gatilho_ref', String(rs7[0].get('uuid') || ''))
  } catch (eG7) {}
  ev.set('period_start', inicio)
  ev.set('period_end', fim)
  ev.set('scope', JSON.stringify({ contas: temTudo ? ['*'] : contasGrant, canais: [] }))
  ev.set('tipos_esperados', JSON.stringify(['diagnostico_periodo']))
  ev.set('payload_resumo', JSON.stringify({ cobertura: cobertura, pedido_por: e.auth.id }))
  ev.set('instrucoes', '')
  ev.set('dados_parciais', parcial)
  ev.set('motivo_parcial', motivoParcial)
  ev.set('estado', 'pendente')
  ev.set('dedupe_key', dedupe)
  ev.set('created_by', e.auth.id)
  ev.set('fixture', false)
  app.save(ev)
  return e.json(200, {
    ok: true,
    replay: false,
    event_id: ev.id,
    evento: {
      period_start: inicio,
      period_end: fim,
      dados_parciais: parcial,
      motivo_parcial: motivoParcial,
    },
  })
})

// ==================== POST /backend/v1/fixtures/seed-card3 (métricas fixture) ====================
routerAdd('POST', '/backend/v1/fixtures/seed-card3', (e) => {
  const esperado = (function () {
    try {
      const v = $secrets.get('FIXTURE_TICK_SECRET')
      return v ? String(v) : ''
    } catch (eS) {
      return ''
    }
  })()
  const recebido = String(e.request.header.get('X-Fixture-Secret') || '')
  if (esperado === '' || recebido === '' || esperado !== recebido) {
    return e.json(404, { ok: false, erro: 'rota não encontrada' })
  }
  const app = $app
  const body = e.requestInfo().body || {}
  const colM = app.findCollectionByNameOrId('metricas_fixtures')
  const linhas = body.metricas || []
  let n = 0
  for (const l of linhas) {
    const rec = new Record(colM)
    rec.set('canal', String(l.canal || 'meta_ads'))
    rec.set('campanha_id', String(l.campanha_id || ''))
    rec.set('data', String(l.data || ''))
    rec.set(
      'impressoes',
      l.impressoes === null || l.impressoes === undefined ? null : Number(l.impressoes),
    )
    rec.set('cliques', l.cliques === null || l.cliques === undefined ? null : Number(l.cliques))
    rec.set('gasto', l.gasto === null || l.gasto === undefined ? null : Number(l.gasto))
    rec.set(
      'resultados',
      l.resultados === null || l.resultados === undefined ? null : Number(l.resultados),
    )
    rec.set('result_type', String(l.result_type || ''))
    rec.set('fixture', true)
    app.save(rec)
    n++
  }
  if (body.politica) {
    const colPol = app.findCollectionByNameOrId('analysis_policy')
    const pol = new Record(colPol)
    pol.set('fixture', true)
    pol.set('enabled', body.politica.enabled !== false)
    pol.set('approved_at', body.politica.approved_at || new Date().toISOString())
    pol.set('max_eventos_automaticos_mes', body.politica.max_eventos || 2)
    pol.set('max_pedidos_manuais_mes', body.politica.max_manuais || 4)
    app.save(pol)
  }
  return e.json(200, { ok: true, metricas: n })
})
