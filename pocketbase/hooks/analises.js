/// <reference path="../pb_data/types.d.ts" />
/**
 * Hooks do canal Maestro↔sistema (SPEC-3-001, card 6b8c8de9, CA-3-01).
 *
 * SEGURANÇA (RN-01): toda rota do Maestro valida
 *   material = timestamp + "." + MÉTODO + "." + caminho_com_id + "." + corpo
 *   GET: corpo = query string EXATAMENTE como recebida (sem query = "")
 *   POST: corpo = JSON canônico (chaves ordenadas, sem espaços) do body;
 *         body vazio/{} → ""
 *   X-Maestro-Timestamp (epoch s) com |agora − ts| ≤ 300 s;
 *   X-Maestro-Signature = HMAC-SHA256(material, segredo) em hex;
 *   comparação em tempo constante. Segredo ausente → 503 canal_indisponivel
 *   SEM avaliar assinatura (nunca aceitar HMAC com segredo vazio).
 *   Recusa → recusas_401_total/24h incrementam (canal_estado).
 *
 * SEGREDO (fonte única ativa por vez — "nunca aceita dois segredos"):
 *   1) $secrets.get('MAESTRO_SHARED_SECRET') — o definitivo, gravado pelo dono no
 *      painel de segredos do Skip; quando presente, IGNORA o de teste;
 *   2) canal_estado.segredo_teste — valor inicial de TESTE gravado pelo
 *      executor via rota fixture (X-Fixture-Secret) enquanto o definitivo não
 *      existe (o painel de segredos não é acessível pelo executor).
 *   Vetor de assinatura publicado em 05_entregas/spec-3-001/vetor-assinatura.md.
 *
 * JSVM (lições do projeto): TODA lógica INLINE nos callbacks (helper top-level
 * não pega no QA/runtime); sem Intl (UTC-3 fixo); json pode voltar como objeto
 * ou array de char-codes (parser tolerante). Segredos via $secrets.get
 * ($os.env NÃO existe no JSVM — lição AP-2026-10-20). routerAdd SEM middleware
 * null explícito (4º arg null lança na carga — lição AP-2026-10-20b). Query da
 * request: e.request.requestURI (e.request.url().rawQuery lança — lição 20/10).
 *
 * Cron `analise_periodo_fechado` (10:30 UTC) — neste card só REENTREGA (RN-08),
 * atualiza canal_estado e faz push opcional; criação de evento automático (RN-03)
 * e pedido manual (RN-07) são do card "Disparar". DESABILITADO até o gate.
 * Rotas de teste exigem X-Fixture-Secret = $secrets.get('FIXTURE_TICK_SECRET') e só
 * atuam sobre registros fixture=true; sem o cabeçalho → 404.
 */

// ==================== CRON (cópia A — lógica inline) ====================
cronAdd('analise_periodo_fechado', '30 10 * * *', () => {
  const app = $app
  const resumo = { reentregas: 0, push_ok: 0, push_falhas: 0, erro_definitivo: 0, avisos: [] }

  // ---- canal_estado (registro único) ----
  const colC = app.findCollectionByNameOrId('canal_estado')
  let canal = null
  const recsC = app.findRecordsByFilter(colC, '', '', 1, 0)
  if (recsC && recsC.length > 0) canal = recsC[0]
  if (!canal) {
    canal = new Record(colC)
    canal.set('ciclos_sem_consumo', 0)
    canal.set('recusas_401_total', 0)
    canal.set('recusas_401_ultimas_24h', 0)
    canal.set('segredo_configurado', false)
    app.save(canal)
  }

  // ---- reentrega (RN-08): pendente/erro com ciclos < 3; 4º ciclo → erro_definitivo ----
  const colE = app.findCollectionByNameOrId('analysis_events')
  const elegiveis = app.findRecordsByFilter(
    colE,
    "estado='pendente' || estado='erro'",
    '-created',
    50,
    0,
  )
  const agoraISO = new Date().toISOString()
  for (const ev of elegiveis) {
    const ciclos = Number(ev.get('ciclos_reentrega') || 0)
    if (ciclos >= 3) {
      if (String(ev.get('estado')) !== 'erro_definitivo') {
        ev.set('estado', 'erro_definitivo')
        app.save(ev)
        resumo.erro_definitivo++
      }
      continue
    }
    // push opcional (1 tentativa por execução; teto tentativas_push = 3)
    const url = (function () {
      try {
        const v = $secrets.get('MAESTRO_WEBHOOK_URL')
        return v ? String(v) : ''
      } catch (eU) {
        return ''
      }
    })()
    if (url && Number(ev.get('tentativas_push') || 0) < 3) {
      const seg = (function () {
        try {
          const v = $secrets.get('MAESTRO_SHARED_SECRET')
          return v ? String(v) : ''
        } catch (eS) {
          return ''
        }
      })()
      let okPush = false
      if (seg) {
        try {
          const corpo = JSON.stringify(
            (function shapeInline(evRef) {
              function parseTol(raw) {
                try {
                  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number')
                    return JSON.parse(String.fromCharCode.apply(null, raw))
                  if (typeof raw === 'string') return raw === '' ? null : JSON.parse(raw)
                  return raw || null
                } catch (eP) {
                  return null
                }
              }
              return {
                event_id: evRef.get('uuid'),
                tipo: evRef.get('tipo'),
                period_start: evRef.get('period_start'),
                period_end: evRef.get('period_end'),
                scope: parseTol(evRef.get('scope')),
                dados_parciais: evRef.get('dados_parciais') === true,
                tipos_esperados: parseTol(evRef.get('tipos_esperados')),
                instrucoes: evRef.get('instrucoes') || '',
                payload_resumo: parseTol(evRef.get('payload_resumo')),
                dados_externos: parseTol(evRef.get('dados_externos')),
              }
            })(ev),
          )
          const ts = Math.floor(Date.now() / 1000)
          const material = 'push.' + ts + '.' + corpo
          const assinatura = $security.hs256(material, seg)
          const resp = $http.send({
            url: url,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Maestro-Timestamp': String(ts),
              'X-Maestro-Signature': assinatura,
            },
            body: corpo,
            timeout: 10,
          })
          ev.set('tentativas_push', Number(ev.get('tentativas_push') || 0) + 1)
          if (resp.statusCode >= 200 && resp.statusCode < 300) {
            ev.set('ultimo_erro', '')
            okPush = true
            resumo.push_ok++
          } else {
            ev.set(
              'ultimo_erro',
              resp.statusCode >= 400 && resp.statusCode < 500 ? 'push_http_4xx' : 'push_http_5xx',
            )
            resumo.push_falhas++
          }
        } catch (ePush) {
          ev.set('tentativas_push', Number(ev.get('tentativas_push') || 0) + 1)
          const msg = String(ePush)
          ev.set('ultimo_erro', msg.indexOf('timeout') >= 0 ? 'push_timeout' : 'push_dns')
          resumo.push_falhas++
        }
      }
      if (okPush) {
        ev.set('estado', 'entregue')
        ev.set('delivered_at', agoraISO)
      }
    }
    ev.set('ciclos_reentrega', ciclos + 1)
    app.save(ev)
    resumo.reentregas++
  }

  // ---- ciclos_sem_consumo ----
  const ultimo = String(canal.get('ultimo_consumo_em') || '')
  if (ultimo === '') {
    canal.set('ciclos_sem_consumo', Number(canal.get('ciclos_sem_consumo') || 0) + 1)
  } else {
    const tUlt = new Date(ultimo.replace(' ', 'T')).getTime()
    if (!Number.isFinite(tUlt) || Date.now() - tUlt > 24 * 3600 * 1000) {
      canal.set('ciclos_sem_consumo', Number(canal.get('ciclos_sem_consumo') || 0) + 1)
    }
  }
  canal.set('atualizado_em', agoraISO)
  app.save(canal)

  console.log('analise_periodo_fechado: ' + JSON.stringify(resumo))
})

// ==================== GET /backend/v1/analises/eventos (pull) ====================
routerAdd('GET', '/backend/v1/analises/eventos', (e) => {
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

  if (!seg) {
    if (canal) {
      canal.set('segredo_configurado', false)
      canal.set('atualizado_em', new Date().toISOString())
      app.save(canal)
    }
    return e.json(503, {
      ok: false,
      erro: 'canal_indisponivel',
      detalhe: 'segredo não configurado',
    })
  }
  if (canal) canal.set('segredo_configurado', true)

  const tsHeader = String(e.request.header.get('X-Maestro-Timestamp') || '')
  const sigHeader = String(e.request.header.get('X-Maestro-Signature') || '')
  const agora = Math.floor(Date.now() / 1000)
  const ts = Number(tsHeader)
  const recusar401 = function (motivo) {
    if (canal) {
      const agoraISO = new Date().toISOString()
      const inicio = String(canal.get('janela_24h_inicio') || '')
      let total24 = Number(canal.get('recusas_401_ultimas_24h') || 0)
      const tInicio = inicio === '' ? NaN : new Date(inicio.replace(' ', 'T')).getTime()
      if (!Number.isFinite(tInicio) || Date.now() - tInicio > 24 * 3600 * 1000) {
        canal.set('janela_24h_inicio', agoraISO)
        total24 = 0
      }
      canal.set('recusas_401_total', Number(canal.get('recusas_401_total') || 0) + 1)
      canal.set('recusas_401_ultimas_24h', total24 + 1)
      canal.set('atualizado_em', agoraISO)
      app.save(canal)
    }
    return e.json(401, { ok: false, erro: motivo })
  }
  if (!tsHeader || !Number.isFinite(ts) || Math.abs(agora - ts) > 300) {
    return recusar401('timestamp ausente ou fora da janela de 300s')
  }
  const caminho = '/backend/v1/analises/eventos'
  const requestURI = String(e.request.requestURI || '')
  const posQ = requestURI.indexOf('?')
  const query = posQ >= 0 ? requestURI.slice(posQ + 1) : ''
  const material = tsHeader + '.GET.' + caminho + '.' + query
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
  if (!igual) return recusar401('assinatura inválida')

  if (canal) {
    canal.set('ultimo_consumo_em', new Date().toISOString())
    canal.set('ciclos_sem_consumo', 0)
    canal.set('atualizado_em', new Date().toISOString())
    app.save(canal)
  }

  const colE = app.findCollectionByNameOrId('analysis_events')
  const registros = app.findRecordsByFilter(colE, '', '-created', 100, 0)
  const itens = []
  for (const ev of registros) {
    itens.push(
      (function shapeInline(evRef) {
        function parseTol(raw) {
          try {
            if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number')
              return JSON.parse(String.fromCharCode.apply(null, raw))
            if (typeof raw === 'string') return raw === '' ? null : JSON.parse(raw)
            return raw || null
          } catch (eP) {
            return null
          }
        }
        return {
          event_id: evRef.get('uuid'),
          tipo: evRef.get('tipo'),
          period_start: evRef.get('period_start'),
          period_end: evRef.get('period_end'),
          scope: parseTol(evRef.get('scope')),
          dados_parciais: evRef.get('dados_parciais') === true,
          tipos_esperados: parseTol(evRef.get('tipos_esperados')),
          instrucoes: evRef.get('instrucoes') || '',
          payload_resumo: parseTol(evRef.get('payload_resumo')),
          dados_externos: parseTol(evRef.get('dados_externos')),
        }
      })(ev),
    )
  }
  return e.json(200, { ok: true, itens: itens })
})

// ==================== POST .../consumir ====================
routerAdd('POST', '/backend/v1/analises/eventos/{id}/consumir', (e) => {
  const id = e.request.pathValue('id')
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
  if (!seg) {
    if (canal) {
      canal.set('segredo_configurado', false)
      canal.set('atualizado_em', new Date().toISOString())
      app.save(canal)
    }
    return e.json(503, {
      ok: false,
      erro: 'canal_indisponivel',
      detalhe: 'segredo não configurado',
    })
  }
  if (canal) canal.set('segredo_configurado', true)
  const tsHeader = String(e.request.header.get('X-Maestro-Timestamp') || '')
  const sigHeader = String(e.request.header.get('X-Maestro-Signature') || '')
  const agora = Math.floor(Date.now() / 1000)
  const ts = Number(tsHeader)
  const recusar401 = function (motivo) {
    if (canal) {
      const agoraISO = new Date().toISOString()
      const inicio = String(canal.get('janela_24h_inicio') || '')
      let total24 = Number(canal.get('recusas_401_ultimas_24h') || 0)
      const tInicio = inicio === '' ? NaN : new Date(inicio.replace(' ', 'T')).getTime()
      if (!Number.isFinite(tInicio) || Date.now() - tInicio > 24 * 3600 * 1000) {
        canal.set('janela_24h_inicio', agoraISO)
        total24 = 0
      }
      canal.set('recusas_401_total', Number(canal.get('recusas_401_total') || 0) + 1)
      canal.set('recusas_401_ultimas_24h', total24 + 1)
      canal.set('atualizado_em', agoraISO)
      app.save(canal)
    }
    return e.json(401, { ok: false, erro: motivo })
  }
  if (!tsHeader || !Number.isFinite(ts) || Math.abs(agora - ts) > 300) {
    return recusar401('timestamp ausente ou fora da janela de 300s')
  }
  const caminho = '/backend/v1/analises/eventos/' + id + '/consumir'
  const info = e.requestInfo()
  const body = info.body
  let corpo = ''
  if (body !== null && body !== undefined) {
    if (typeof body === 'object') {
      const chaves = Object.keys(body)
      if (chaves.length > 0) corpo = jsonCanonico(body)
    } else if (typeof body === 'string' && body.length > 0) {
      corpo = body
    }
  }
  const material = tsHeader + '.POST.' + caminho + '.' + corpo
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
  if (!igual) return recusar401('assinatura inválida')
  if (canal) app.save(canal)

  let ev
  try {
    ev = app.findRecordById('analysis_events', id)
  } catch (_) {
    return e.json(404, { ok: false, erro: 'evento não encontrado' })
  }
  const estado = String(ev.get('estado') || '')
  if (estado === 'consumido') {
    marcarConsumo(app)
    return e.json(200, { ok: true, event_id: ev.get('uuid'), estado: 'consumido', replay: true })
  }
  if (estado !== 'pendente' && estado !== 'entregue') {
    return e.json(409, { ok: false, erro: 'estado incompatível para consumir (' + estado + ')' })
  }
  ev.set('estado', 'consumido')
  ev.set('consumed_at', new Date().toISOString())
  app.save(ev)
  marcarConsumo(app)
  return e.json(200, { ok: true, event_id: ev.get('uuid'), estado: 'consumido', replay: false })

  function marcarConsumo(appRef) {
    const colC2 = appRef.findCollectionByNameOrId('canal_estado')
    const recs2 = appRef.findRecordsByFilter(colC2, '', '', 1, 0)
    if (recs2 && recs2.length > 0) {
      recs2[0].set('ultimo_consumo_em', new Date().toISOString())
      recs2[0].set('ciclos_sem_consumo', 0)
      recs2[0].set('atualizado_em', new Date().toISOString())
      appRef.save(recs2[0])
    }
  }
  function jsonCanonico(v) {
    if (v === null || v === undefined) return ''
    if (typeof v !== 'object') return JSON.stringify(v)
    if (Array.isArray(v)) {
      const partes = []
      for (const item of v) partes.push(jsonCanonico(item))
      return '[' + partes.join(',') + ']'
    }
    const chaves = Object.keys(v).sort()
    const partes = []
    for (const k of chaves) partes.push(JSON.stringify(k) + ':' + jsonCanonico(v[k]))
    return '{' + partes.join(',') + '}'
  }
})

// ==================== POST .../concluir ====================
routerAdd('POST', '/backend/v1/analises/eventos/{id}/concluir', (e) => {
  const id = e.request.pathValue('id')
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
  if (!seg) {
    if (canal) {
      canal.set('segredo_configurado', false)
      canal.set('atualizado_em', new Date().toISOString())
      app.save(canal)
    }
    return e.json(503, {
      ok: false,
      erro: 'canal_indisponivel',
      detalhe: 'segredo não configurado',
    })
  }
  if (canal) canal.set('segredo_configurado', true)
  const tsHeader = String(e.request.header.get('X-Maestro-Timestamp') || '')
  const sigHeader = String(e.request.header.get('X-Maestro-Signature') || '')
  const agora = Math.floor(Date.now() / 1000)
  const ts = Number(tsHeader)
  const recusar401 = function (motivo) {
    if (canal) {
      const agoraISO = new Date().toISOString()
      const inicio = String(canal.get('janela_24h_inicio') || '')
      let total24 = Number(canal.get('recusas_401_ultimas_24h') || 0)
      const tInicio = inicio === '' ? NaN : new Date(inicio.replace(' ', 'T')).getTime()
      if (!Number.isFinite(tInicio) || Date.now() - tInicio > 24 * 3600 * 1000) {
        canal.set('janela_24h_inicio', agoraISO)
        total24 = 0
      }
      canal.set('recusas_401_total', Number(canal.get('recusas_401_total') || 0) + 1)
      canal.set('recusas_401_ultimas_24h', total24 + 1)
      canal.set('atualizado_em', agoraISO)
      app.save(canal)
    }
    return e.json(401, { ok: false, erro: motivo })
  }
  if (!tsHeader || !Number.isFinite(ts) || Math.abs(agora - ts) > 300) {
    return recusar401('timestamp ausente ou fora da janela de 300s')
  }
  const caminho = '/backend/v1/analises/eventos/' + id + '/concluir'
  const info = e.requestInfo()
  const body = info.body
  let corpo = ''
  if (body !== null && body !== undefined) {
    if (typeof body === 'object') {
      const chaves = Object.keys(body)
      if (chaves.length > 0) corpo = jsonCanonico(body)
    } else if (typeof body === 'string' && body.length > 0) {
      corpo = body
    }
  }
  const material = tsHeader + '.POST.' + caminho + '.' + corpo
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
  if (!igual) return recusar401('assinatura inválida')
  if (canal) app.save(canal)

  let ev
  try {
    ev = app.findRecordById('analysis_events', id)
  } catch (_) {
    return e.json(404, { ok: false, erro: 'evento não encontrado' })
  }
  const estado = String(ev.get('estado') || '')
  if (estado === 'concluido') {
    marcarConsumo(app)
    return e.json(200, { ok: true, event_id: ev.get('uuid'), estado: 'concluido', replay: true })
  }
  if (estado !== 'consumido') {
    return e.json(409, { ok: false, erro: 'estado incompatível para concluir (' + estado + ')' })
  }
  const colA = app.findCollectionByNameOrId('analyses')
  const analises = app.findRecordsByFilter(colA, "event_id='" + id + "'", '', 1, 0)
  if (!analises || analises.length === 0) {
    return e.json(422, {
      ok: false,
      erro: 'concluir exige pelo menos uma análise gravada para o evento',
      campos: { analises: 'nenhuma análise do evento' },
    })
  }
  ev.set('estado', 'concluido')
  ev.set('concluded_at', new Date().toISOString())
  app.save(ev)
  marcarConsumo(app)
  return e.json(200, { ok: true, event_id: ev.get('uuid'), estado: 'concluido', replay: false })

  function marcarConsumo(appRef) {
    const colC2 = appRef.findCollectionByNameOrId('canal_estado')
    const recs2 = appRef.findRecordsByFilter(colC2, '', '', 1, 0)
    if (recs2 && recs2.length > 0) {
      recs2[0].set('ultimo_consumo_em', new Date().toISOString())
      recs2[0].set('ciclos_sem_consumo', 0)
      recs2[0].set('atualizado_em', new Date().toISOString())
      appRef.save(recs2[0])
    }
  }
  function jsonCanonico(v) {
    if (v === null || v === undefined) return ''
    if (typeof v !== 'object') return JSON.stringify(v)
    if (Array.isArray(v)) {
      const partes = []
      for (const item of v) partes.push(jsonCanonico(item))
      return '[' + partes.join(',') + ']'
    }
    const chaves = Object.keys(v).sort()
    const partes = []
    for (const k of chaves) partes.push(JSON.stringify(k) + ':' + jsonCanonico(v[k]))
    return '{' + partes.join(',') + '}'
  }
})

// ==================== POST .../erro ====================
routerAdd('POST', '/backend/v1/analises/eventos/{id}/erro', (e) => {
  const id = e.request.pathValue('id')
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
  if (!seg) {
    if (canal) {
      canal.set('segredo_configurado', false)
      canal.set('atualizado_em', new Date().toISOString())
      app.save(canal)
    }
    return e.json(503, {
      ok: false,
      erro: 'canal_indisponivel',
      detalhe: 'segredo não configurado',
    })
  }
  if (canal) canal.set('segredo_configurado', true)
  const tsHeader = String(e.request.header.get('X-Maestro-Timestamp') || '')
  const sigHeader = String(e.request.header.get('X-Maestro-Signature') || '')
  const agora = Math.floor(Date.now() / 1000)
  const ts = Number(tsHeader)
  const recusar401 = function (motivo) {
    if (canal) {
      const agoraISO = new Date().toISOString()
      const inicio = String(canal.get('janela_24h_inicio') || '')
      let total24 = Number(canal.get('recusas_401_ultimas_24h') || 0)
      const tInicio = inicio === '' ? NaN : new Date(inicio.replace(' ', 'T')).getTime()
      if (!Number.isFinite(tInicio) || Date.now() - tInicio > 24 * 3600 * 1000) {
        canal.set('janela_24h_inicio', agoraISO)
        total24 = 0
      }
      canal.set('recusas_401_total', Number(canal.get('recusas_401_total') || 0) + 1)
      canal.set('recusas_401_ultimas_24h', total24 + 1)
      canal.set('atualizado_em', agoraISO)
      app.save(canal)
    }
    return e.json(401, { ok: false, erro: motivo })
  }
  if (!tsHeader || !Number.isFinite(ts) || Math.abs(agora - ts) > 300) {
    return recusar401('timestamp ausente ou fora da janela de 300s')
  }
  const caminho = '/backend/v1/analises/eventos/' + id + '/erro'
  const info = e.requestInfo()
  const body = info.body || {}
  const motivoErro = String(body.motivo || '').slice(0, 500)
  const corpo = jsonCanonico({ motivo: motivoErro })
  const material = tsHeader + '.POST.' + caminho + '.' + corpo
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
  if (!igual) return recusar401('assinatura inválida')
  if (canal) app.save(canal)

  if (motivoErro === '') {
    return e.json(422, {
      ok: false,
      erro: 'entrada inválida',
      campos: { motivo: 'obrigatório (≤500)' },
    })
  }
  let ev
  try {
    ev = app.findRecordById('analysis_events', id)
  } catch (_) {
    return e.json(404, { ok: false, erro: 'evento não encontrado' })
  }
  const estado = String(ev.get('estado') || '')
  if (estado !== 'entregue' && estado !== 'consumido') {
    return e.json(409, { ok: false, erro: 'estado incompatível para marcar erro (' + estado + ')' })
  }
  ev.set('estado', 'erro')
  ev.set('ultimo_erro', 'maestro_erro')
  app.save(ev)
  const recs2 = app.findRecordsByFilter(app.findCollectionByNameOrId('canal_estado'), '', '', 1, 0)
  if (recs2 && recs2.length > 0) {
    recs2[0].set('ultimo_consumo_em', new Date().toISOString())
    recs2[0].set('ciclos_sem_consumo', 0)
    recs2[0].set('atualizado_em', new Date().toISOString())
    app.save(recs2[0])
  }
  return e.json(200, { ok: true, event_id: ev.get('uuid'), estado: 'erro' })

  function jsonCanonico(v) {
    if (v === null || v === undefined) return ''
    if (typeof v !== 'object') return JSON.stringify(v)
    if (Array.isArray(v)) {
      const partes = []
      for (const item of v) partes.push(jsonCanonico(item))
      return '[' + partes.join(',') + ']'
    }
    const chaves = Object.keys(v).sort()
    const partes = []
    for (const k of chaves) partes.push(JSON.stringify(k) + ':' + jsonCanonico(v[k]))
    return '{' + partes.join(',') + '}'
  }
})

// ==================== POST .../retomar (dono nesta fase) ====================
routerAdd(
  'POST',
  '/backend/v1/analises/eventos/{id}/retomar',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    if (!e.hasSuperuserAuth()) {
      return e.json(403, { ok: false, erro: 'retomar é ação do dono nesta fase' })
    }
    const app = $app
    let ev
    try {
      ev = app.findRecordById('analysis_events', e.request.pathValue('id'))
    } catch (_) {
      return e.json(404, { ok: false, erro: 'evento não encontrado' })
    }
    const estado = String(ev.get('estado') || '')
    if (estado !== 'erro' && estado !== 'erro_definitivo') {
      return e.json(409, { ok: false, erro: 'só evento em erro/erro_definitivo pode ser retomado' })
    }
    ev.set('estado', 'pendente')
    ev.set('ciclos_reentrega', 0)
    ev.set('tentativas_push', 0)
    ev.set('ultimo_erro', '')
    app.save(ev)
    return e.json(200, { ok: true, event_id: ev.get('uuid'), estado: 'pendente' })
  },
  $apis.requireAuth(),
)

// ==================== GET /backend/v1/analises/canal-estado (saúde p/ tela, autenticado) ====================
routerAdd(
  'GET',
  '/backend/v1/analises/canal-estado',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const app = $app
    const colC = app.findCollectionByNameOrId('canal_estado')
    const recs = app.findRecordsByFilter(colC, '', '', 1, 0)
    if (!recs || recs.length === 0) {
      return e.json(200, { ok: true, canal: null })
    }
    const c = recs[0]
    return e.json(200, {
      ok: true,
      canal: {
        ultimo_consumo_em: c.get('ultimo_consumo_em'),
        ciclos_sem_consumo: c.get('ciclos_sem_consumo'),
        recusas_401_total: c.get('recusas_401_total'),
        recusas_401_ultimas_24h: c.get('recusas_401_ultimas_24h'),
        segredo_configurado: c.get('segredo_configurado'),
        atualizado_em: c.get('atualizado_em'),
      },
    })
  },
  $apis.requireAuth(),
)

// ==================== ROTAS DE TESTE (X-Fixture-Secret) ====================

// ---------- POST /backend/v1/analises/tick (relógio de teste) ----------
routerAdd('POST', '/backend/v1/analises/tick', (e) => {
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
  const resumo = { reentregas: 0, push_ok: 0, push_falhas: 0, erro_definitivo: 0, avisos: [] }
  const colE = app.findCollectionByNameOrId('analysis_events')
  const elegiveis = app.findRecordsByFilter(
    colE,
    "fixture=true && (estado='pendente' || estado='erro')",
    '-created',
    50,
    0,
  )
  const agoraISO = new Date().toISOString()
  for (const ev of elegiveis) {
    const ciclos = Number(ev.get('ciclos_reentrega') || 0)
    if (ciclos >= 3) {
      if (String(ev.get('estado')) !== 'erro_definitivo') {
        ev.set('estado', 'erro_definitivo')
        app.save(ev)
        resumo.erro_definitivo++
      }
      continue
    }
    // push: URL de teste (body.push_url) tem precedência no tick; senão segredo de plataforma
    const url =
      String(body.push_url || '') ||
      (function () {
        try {
          const v = $secrets.get('MAESTRO_WEBHOOK_URL')
          return v ? String(v) : ''
        } catch (eU) {
          return ''
        }
      })()
    if (url && Number(ev.get('tentativas_push') || 0) < 3) {
      const seg = (function () {
        try {
          const v = $secrets.get('MAESTRO_SHARED_SECRET')
          if (v) return String(v)
        } catch (eS) {}
        const colC = app.findCollectionByNameOrId('canal_estado')
        const recsC = app.findRecordsByFilter(colC, '', '', 1, 0)
        return recsC && recsC.length > 0 ? String(recsC[0].get('segredo_teste') || '') : ''
      })()
      let okPush = false
      if (seg) {
        try {
          const corpo = JSON.stringify(
            (function shapeInline(evRef) {
              function parseTol(raw) {
                try {
                  if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number')
                    return JSON.parse(String.fromCharCode.apply(null, raw))
                  if (typeof raw === 'string') return raw === '' ? null : JSON.parse(raw)
                  return raw || null
                } catch (eP) {
                  return null
                }
              }
              return {
                event_id: evRef.get('uuid'),
                tipo: evRef.get('tipo'),
                period_start: evRef.get('period_start'),
                period_end: evRef.get('period_end'),
                scope: parseTol(evRef.get('scope')),
                dados_parciais: evRef.get('dados_parciais') === true,
                tipos_esperados: parseTol(evRef.get('tipos_esperados')),
                instrucoes: evRef.get('instrucoes') || '',
                payload_resumo: parseTol(evRef.get('payload_resumo')),
                dados_externos: parseTol(evRef.get('dados_externos')),
              }
            })(ev),
          )
          const ts = Math.floor(Date.now() / 1000)
          const material = 'push.' + ts + '.' + corpo
          const assinatura = $security.hs256(material, seg)
          const resp = $http.send({
            url: url,
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'X-Maestro-Timestamp': String(ts),
              'X-Maestro-Signature': assinatura,
            },
            body: corpo,
            timeout: 10,
          })
          ev.set('tentativas_push', Number(ev.get('tentativas_push') || 0) + 1)
          if (resp.statusCode >= 200 && resp.statusCode < 300) {
            ev.set('ultimo_erro', '')
            okPush = true
            resumo.push_ok++
          } else {
            ev.set(
              'ultimo_erro',
              resp.statusCode >= 400 && resp.statusCode < 500 ? 'push_http_4xx' : 'push_http_5xx',
            )
            resumo.push_falhas++
          }
        } catch (ePush) {
          ev.set('tentativas_push', Number(ev.get('tentativas_push') || 0) + 1)
          const msg = String(ePush)
          ev.set('ultimo_erro', msg.indexOf('timeout') >= 0 ? 'push_timeout' : 'push_dns')
          resumo.push_falhas++
        }
      }
      if (okPush) {
        ev.set('estado', 'entregue')
        ev.set('delivered_at', agoraISO)
      }
    }
    ev.set('ciclos_reentrega', ciclos + 1)
    app.save(ev)
    resumo.reentregas++
  }
  return e.json(200, { ok: true, tick: resumo })
})

// ---------- POST /backend/v1/fixtures/segredo-canal (grava segredo de TESTE) ----------
routerAdd('POST', '/backend/v1/fixtures/segredo-canal', (e) => {
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
  const valor = String(body.valor || '')
  if (valor === '' || valor.length > 200) {
    return e.json(422, {
      ok: false,
      erro: 'entrada inválida',
      campos: { valor: 'obrigatório (≤200)' },
    })
  }
  const colC = app.findCollectionByNameOrId('canal_estado')
  let canal = null
  const recs = app.findRecordsByFilter(colC, '', '', 1, 0)
  if (recs && recs.length > 0) canal = recs[0]
  if (!canal) {
    canal = new Record(colC)
    canal.set('ciclos_sem_consumo', 0)
    canal.set('recusas_401_total', 0)
    canal.set('recusas_401_ultimas_24h', 0)
  }
  canal.set('segredo_teste', valor)
  canal.set('segredo_configurado', true)
  canal.set('atualizado_em', new Date().toISOString())
  app.save(canal)
  // resposta NUNCA devolve o valor
  return e.json(200, { ok: true, segredo_configurado: true })
})

// ---------- POST /backend/v1/fixtures/seed-canal (semeia evento+análise fixture) ----------
routerAdd('POST', '/backend/v1/fixtures/seed-canal', (e) => {
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
  const serie = String(body.serie || '')
  const colE = app.findCollectionByNameOrId('analysis_events')
  const dedupe = 'fixture|periodo_fechado|2026-10-16|2026-10-31|*' + (serie ? '|' + serie : '')
  const existentes = app.findRecordsByFilter(colE, "dedupe_key='" + dedupe + "'", '', 1, 0)
  let ev
  if (existentes && existentes.length > 0) {
    ev = existentes[0]
  } else {
    ev = new Record(colE)
    ev.set('uuid', 'evt-fixture-canal-001' + (serie ? '-' + serie : ''))
    ev.set('tipo', 'periodo_fechado')
    ev.set('period_start', '2026-10-16')
    ev.set('period_end', '2026-10-31')
    ev.set('scope', JSON.stringify({ contas: [], canais: [] }))
    ev.set('tipos_esperados', JSON.stringify(['diagnostico_periodo']))
    ev.set(
      'payload_resumo',
      JSON.stringify({
        fixture: true,
        canais: { meta_ads: { gasto: 100 }, google_ads: { gasto: 50 } },
      }),
    )
    ev.set('instrucoes', 'Fixture da prova do canal — produza apenas fatos citáveis.')
    ev.set('dados_parciais', false)
    ev.set('estado', 'pendente')
    ev.set('dedupe_key', dedupe)
    ev.set('created_by', 'system')
    ev.set('fixture', true)
    app.save(ev)
  }
  const colA = app.findCollectionByNameOrId('analyses')
  const trio = app.findRecordsByFilter(
    colA,
    "event_id='" + ev.id + "' && tipo='diagnostico_periodo' && alvo_ref=''",
    '',
    1,
    0,
  )
  let analise
  if (trio && trio.length > 0) {
    analise = trio[0]
  } else {
    analise = new Record(colA)
    analise.set('uuid', 'ana-fixture-canal-001' + (serie ? '-' + serie : ''))
    analise.set('event_id', ev.id)
    analise.set('tipo', 'diagnostico_periodo')
    analise.set('alvo_ref', '')
    analise.set('period_start', '2026-10-16')
    analise.set('period_end', '2026-10-31')
    analise.set('scope', JSON.stringify({ contas: [], canais: [] }))
    analise.set(
      'conteudo',
      'Fixture: gasto total do período somou R$ 150 (meta_ads R$ 100, google_ads R$ 50). Inferência marcada como inferência — nada aqui é recomendação.',
    )
    analise.set('evidencias', JSON.stringify([]))
    analise.set('origem', 'ia')
    analise.set('estado', 'rascunho')
    analise.set('gerado_em', new Date().toISOString())
    analise.set('versao', 1)
    analise.set('fixture', true)
    app.save(analise)
  }
  return e.json(200, { ok: true, evento: ev.id, analise: analise.id })
})

// ---------- POST /backend/v1/fixtures/push (alvo de push para provas) ----------
routerAdd('POST', '/backend/v1/fixtures/push', (e) => {
  const status = Number(e.request.url.query().get('status') || '500')
  return e.json(status, { ok: false, fixture: 'push', status: status })
})

// ---------- GET /backend/v1/fixtures/canal-estado (saúde p/ provas) ----------
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
      ultimo_consumo_em: c.get('ultimo_consumo_em'),
      ciclos_sem_consumo: c.get('ciclos_sem_consumo'),
      recusas_401_total: c.get('recusas_401_total'),
      recusas_401_ultimas_24h: c.get('recusas_401_ultimas_24h'),
      segredo_configurado: c.get('segredo_configurado'),
      atualizado_em: c.get('atualizado_em'),
    },
  })
})
