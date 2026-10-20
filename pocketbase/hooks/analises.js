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

  // ---- RN-03: evento automatico da ultima quinzena fechada (gate: politica + cobertura) ----
  ;(function rn03() {
    try {
      const hojeRef3 = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
      const colPol3 = app.findCollectionByNameOrId('analysis_policy')
      const politicas3 = app.findRecordsByFilter(
        colPol3,
        "fixture=false && enabled=true && approved_at!=''",
        '',
        1,
        0,
      )
      if (!politicas3 || politicas3.length === 0) {
        resumo.avisos.push('RN-03: politica sem gate (desabilitada/sem aprovacao) — 0 eventos')
        return
      }
      const pol3 = politicas3[0]
      const dia3 = Number(hojeRef3.slice(8, 10))
      let inicio3 = ''
      let fim3 = ''
      if (dia3 >= 16) {
        inicio3 = hojeRef3.slice(0, 7) + '-01'
        fim3 = hojeRef3.slice(0, 7) + '-15'
      } else {
        const pAno3 = Number(hojeRef3.slice(0, 4))
        const pMes3 = Number(hojeRef3.slice(5, 7))
        const a2 = pMes3 === 1 ? pAno3 - 1 : pAno3
        const m2 = pMes3 === 1 ? 12 : pMes3 - 1
        const m2s = (m2 < 10 ? '0' : '') + m2
        inicio3 = a2 + '-' + m2s + '-16'
        fim3 = new Date(Date.UTC(a2, m2, 1) - 86400000).toISOString().slice(0, 10)
      }
      const diasPeriodo3 =
        Math.round(
          (new Date(fim3 + 'T00:00:00Z').getTime() - new Date(inicio3 + 'T00:00:00Z').getTime()) /
            86400000,
        ) + 1
      const colM3 = app.findCollectionByNameOrId('metricas_diarias')
      const regs3 = app.findRecordsByFilter(
        colM3,
        "data >= '" + inicio3 + "' && data <= '" + fim3 + " 23:59:59.999Z'" + " && origem='api'",
        'data',
        2000,
        0,
      )
      const porCanal3 = {}
      const campanhas3 = {}
      const indicadores3 = {}
      for (const r of regs3) {
        const c3 = String(r.get('canal') || '')
        if (!porCanal3[c3]) porCanal3[c3] = {}
        porCanal3[c3][String(r.get('data')).slice(0, 10)] = true
        const cid3 = String(r.get('campanha_id') || '')
        if (cid3) campanhas3[cid3] = true
        const chave3 =
          c3 +
          '|' +
          String(r.get('objetivo') || 'nao_informado') +
          '|' +
          String(r.get('natureza') || 'pago')
        if (!indicadores3[chave3])
          indicadores3[chave3] = { gasto: 0, cliques: 0, impressoes: 0, alcance: 0, resultados: 0 }
        const n3 = function (v) {
          const x = Number(v)
          return Number.isFinite(x) ? x : 0
        }
        indicadores3[chave3].gasto += n3(r.get('gasto'))
        indicadores3[chave3].cliques += n3(r.get('cliques'))
        indicadores3[chave3].impressoes += n3(r.get('impressoes'))
        indicadores3[chave3].alcance += n3(r.get('alcance'))
        indicadores3[chave3].resultados += n3(r.get('resultados'))
      }
      const cobertura3 = []
      const faltas3 = []
      let completa3 = true
      for (const c3 of ['meta_ads', 'google_ads']) {
        const dias3 = porCanal3[c3] ? Object.keys(porCanal3[c3]).length : 0
        cobertura3.push({ canal: c3, dias: dias3, esperados: diasPeriodo3 })
        if (dias3 < diasPeriodo3) {
          completa3 = false
          faltas3.push(c3 + ' ' + dias3 + '/' + diasPeriodo3)
        }
      }
      function motivoCanal3(txt) {
        try {
          const colA3 = app.findCollectionByNameOrId('canal_avisos')
          const a3 = new Record(colA3)
          a3.set('motivo', ('' + txt).slice(0, 300))
          a3.set('origem', 'cron')
          a3.set('criado_em', new Date().toISOString())
          app.save(a3)
        } catch (eM3) {}
      }
      if (!completa3) {
        motivoCanal3('cobertura incompleta ' + inicio3 + '..' + fim3 + ': ' + faltas3.join(', '))
        resumo.avisos.push('RN-03: cobertura incompleta — 0 eventos (' + faltas3.join(', ') + ')')
        return
      }
      let gatilho3 = ''
      try {
        const colR3 = app.findCollectionByNameOrId('reports')
        const rr3 = app.findRecordsByFilter(
          colR3,
          "period_start='" +
            inicio3 +
            "' && period_end='" +
            fim3 +
            "' && scope='' && report_revision=1",
          '',
          1,
          0,
        )
        if (rr3 && rr3.length > 0) gatilho3 = rr3[0].id
      } catch (eR3) {}
      const tipos3 = ['diagnostico_periodo']
      if (Object.keys(campanhas3).length > 0) {
        tipos3.push('parecer_campanha')
        tipos3.push('parecer_criativo')
      }
      if (gatilho3) tipos3.push('resumo_relatorio')
      const instrucoes3 =
        String(pol3.get('instrucoes_padrao') || '') +
        (gatilho3
          ? ' Produza tambem o resumo do relatorio (tipo resumo_relatorio, alvo_ref=' +
            gatilho3 +
            '), ate 2.500 caracteres, apenas fatos citaveis do relatorio.'
          : '') +
        ' Tipos esperados: ' +
        tipos3.join(', ') +
        '.'
      const dedupe3 = 'periodo_fechado|' + inicio3 + '|' + fim3 + '|*'
      const colE3 = app.findCollectionByNameOrId('analysis_events')
      const ex3 = app.findRecordsByFilter(colE3, "dedupe_key='" + dedupe3 + "'", '', 1, 0)
      if (ex3 && ex3.length > 0) {
        resumo.avisos.push('RN-03: evento ja existe (idempotente) — ' + inicio3 + '..' + fim3)
        return
      }
      const maxEv3 = Number(pol3.get('max_eventos_automaticos_por_mes') || 0)
      if (maxEv3 > 0) {
        const doMes3 = app.findRecordsByFilter(
          colE3,
          "tipo='periodo_fechado' && period_start >= '" +
            hojeRef3.slice(0, 7) +
            "-01' && period_start <= '" +
            hojeRef3.slice(0, 7) +
            "-31'",
          '',
          100,
          0,
        )
        if (doMes3.length >= maxEv3) {
          motivoCanal3('teto mensal de eventos automaticos ' + doMes3.length + '/' + maxEv3)
          resumo.avisos.push('RN-03: teto mensal ' + doMes3.length + '/' + maxEv3 + ' — 0 eventos')
          return
        }
      }
      const ev3 = new Record(colE3)
      ev3.set(
        'uuid',
        (function () {
          const h = '0123456789abcdef'
          let u = ''
          for (let i = 0; i < 36; i++) {
            if (i === 8 || i === 13 || i === 18 || i === 23) u += '-'
            else if (i === 14) u += '4'
            else if (i === 19) u += h[8 + Math.floor(Math.random() * 4)]
            else u += h[Math.floor(Math.random() * 16)]
          }
          return u
        })(),
      )
      ev3.set('tipo', 'periodo_fechado')
      if (gatilho3) ev3.set('gatilho_ref', gatilho3)
      ev3.set('period_start', inicio3)
      ev3.set('period_end', fim3)
      ev3.set('scope', JSON.stringify({ contas: [], canais: [] }))
      ev3.set('tipos_esperados', JSON.stringify(tipos3))
      ev3.set(
        'payload_resumo',
        JSON.stringify({
          cobertura: cobertura3,
          indicadores: indicadores3,
          campanhas: Object.keys(campanhas3),
        }),
      )
      ev3.set('instrucoes', instrucoes3)
      ev3.set('dados_parciais', false)
      ev3.set('estado', 'pendente')
      ev3.set('dedupe_key', dedupe3)
      ev3.set('created_by', 'system')
      ev3.set('fixture', false)
      app.save(ev3)
      resumo.eventos_criados = (Number(resumo.eventos_criados) || 0) + 1
      resumo.avisos.push(
        'RN-03: evento criado ' + inicio3 + '..' + fim3 + (gatilho3 ? ' (gatilho_ref ok)' : ''),
      )
    } catch (eRn3) {
      resumo.avisos.push('RN-03 erro: ' + String(eRn3).slice(0, 120))
    }
  })()

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

// ==================== POST /backend/v1/analises (grava análise — canal assinado) ====================
routerAdd('POST', '/backend/v1/analises', (e) => {
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
  const caminho = '/backend/v1/analises'
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

  // ---- validação de entrada (CA-3-02) ----
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
  const b = body || {}
  const eventRef = String(b.event_id || '').trim()
  const tipo = String(b.tipo || '').trim()
  const alvoRef = String(b.alvo_ref || '').trim()
  const conteudo = String(b.conteudo || '')
  const modelo = String(b.modelo || '').slice(0, 120)
  const evidencias = b.evidencias
  const erros = {}
  if (eventRef === '') erros.event_id = 'obrigatório'
  if (tipo === '') erros.tipo = 'obrigatório'
  else if (tipo.length > 40) erros.tipo = 'máx. 40'
  if (alvoRef.length > 64) erros.alvo_ref = 'máx. 64'
  const conteudoTrim = conteudo.trim()
  if (conteudoTrim === '') erros.conteudo = 'obrigatório'
  else if (conteudoTrim.length > 8000) erros.conteudo = 'máx. 8000 caracteres'
  if (Object.keys(erros).length > 0) {
    return e.json(422, { ok: false, erro: 'entrada inválida', campos: erros })
  }
  // evento existe?
  let ev
  try {
    ev = app.findRecordById('analysis_events', eventRef)
  } catch (_) {
    return e.json(404, { ok: false, erro: 'evento não encontrado' })
  }
  const estadoEv = String(ev.get('estado') || '')
  if (estadoEv === 'concluido') {
    return e.json(409, { ok: false, erro: 'evento concluído — não aceita novas análises' })
  }
  // alvo dentro do período/escopo do evento
  if (alvoRef !== '') {
    const pStart = String(ev.get('period_start') || '')
    const pEnd = String(ev.get('period_end') || '')
    const scope = parseTol(ev.get('scope')) || {}
    const contas = Array.isArray(scope.contas) ? scope.contas : []
    if (contas.indexOf('*') < 0 && contas.length > 0) {
      let dentro = false
      for (const c of contas) {
        if (alvoRef.indexOf(String(c)) >= 0) dentro = true
      }
      if (!dentro) {
        return e.json(422, {
          ok: false,
          erro: 'alvo fora do escopo do evento',
          campos: { alvo_ref: 'fora do escopo' },
        })
      }
    }
    if (pStart && pEnd) {
      const datas = alvoRef.match(/\d{4}-\d{2}-\d{2}/g) || []
      for (const d of datas) {
        if (d < pStart || d > pEnd) {
          return e.json(422, {
            ok: false,
            erro: 'alvo fora do período do evento',
            campos: { alvo_ref: 'fora do período ' + pStart + ' → ' + pEnd },
          })
        }
      }
    }
  }
  // replay: mesmo trio (evento, tipo, alvo) com texto IGUAL devolve a mesma análise
  const colA = app.findCollectionByNameOrId('analyses')
  const mesmoTrio = app.findRecordsByFilter(
    colA,
    "event_id='" +
      eventRef +
      "' && tipo='" +
      tipo.replace(/'/g, '') +
      "' && alvo_ref='" +
      alvoRef.replace(/'/g, '') +
      "'",
    '-created',
    1,
    0,
  )
  if (mesmoTrio && mesmoTrio.length > 0) {
    const anterior = mesmoTrio[0]
    const conteudoAnterior = String(anterior.get('conteudo') || '')
    if (conteudoAnterior === conteudo) {
      return e.json(200, {
        ok: true,
        replay: true,
        analysis_id: anterior.id,
        uuid: anterior.get('uuid'),
        estado: anterior.get('estado'),
      })
    }
    return e.json(409, {
      ok: false,
      erro: 'mesmo trio (evento, tipo, alvo) com texto diferente',
      analysis_id: anterior.id,
    })
  }
  // grava a análise (origem ia, rascunho, trilha)
  const agoraISO = new Date().toISOString()
  const ana = new Record(colA)
  ana.set(
    'uuid',
    'ana-' + agoraISO.replace(/[-:TZ.]/g, '') + '-' + Math.floor(Math.random() * 900 + 100),
  )
  ana.set('event_id', ev.id)
  ana.set('tipo', tipo)
  ana.set('alvo_ref', alvoRef)
  ana.set('period_start', ev.get('period_start'))
  ana.set('period_end', ev.get('period_end'))
  ana.set('scope', ev.get('scope') || JSON.stringify({}))
  ana.set('conteudo', conteudoTrim)
  ana.set(
    'evidencias',
    typeof evidencias === 'string' ? evidencias : JSON.stringify(evidencias || []),
  )
  ana.set('modelo', modelo)
  ana.set('gerado_em', agoraISO)
  ana.set('origem', 'ia')
  ana.set('estado', 'rascunho')
  ana.set('versao', 1)
  ana.set('fixture', ev.get('fixture') === true)
  app.save(ana)
  return e.json(201, {
    ok: true,
    replay: false,
    analysis_id: ana.id,
    uuid: ana.get('uuid'),
    estado: 'rascunho',
  })

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

// ==================== GET /backend/v1/analises (lista autenticada p/ tela) ====================
routerAdd('GET', '/backend/v1/analises', (e) => {
  if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
  const app = $app
  const hoje = new Date().toISOString().slice(0, 10)
  const colG = app.findCollectionByNameOrId('access_grants')
  const meus = app.findRecordsByFilter(
    colG,
    "user_id='" + e.auth.id + "' && revoked_at=''",
    '',
    50,
    0,
  )
  let temRead = false
  for (const g of meus) {
    const ate = String(g.get('valid_until') || '')
    if (ate !== '' && ate.slice(0, 10) < hoje) continue
    let acts = []
    try {
      const raw = g.get('actions')
      if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
        acts = JSON.parse(String.fromCharCode.apply(null, raw))
      } else if (typeof raw === 'string') {
        acts = JSON.parse(raw)
      } else {
        acts = raw || []
      }
    } catch (e2) {}
    if (acts.indexOf('read_analyses') >= 0) {
      temRead = true
      break
    }
  }
  if (!temRead) {
    return e.json(403, {
      ok: false,
      erro: 'sem permissão para ler análises (read_analyses) — fale com o administrador',
    })
  }
  const colA = app.findCollectionByNameOrId('analyses')
  const registros = app.findRecordsByFilter(colA, '', '-created', 100, 0)
  const itens = []
  for (const a of registros) {
    let evid = []
    try {
      const raw = a.get('evidencias')
      evid =
        Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number'
          ? JSON.parse(String.fromCharCode.apply(null, raw))
          : typeof raw === 'string'
            ? JSON.parse(raw)
            : raw || []
    } catch (eE) {}
    itens.push({
      id: a.id,
      uuid: a.get('uuid'),
      event_id: a.get('event_id'),
      tipo: a.get('tipo'),
      alvo_ref: a.get('alvo_ref'),
      period_start: a.get('period_start'),
      period_end: a.get('period_end'),
      conteudo: a.get('conteudo'),
      evidencias: evid,
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
    let ultimoMotivo = ''
    let motivoOrigem = ''
    try {
      const colAv = app.findCollectionByNameOrId('canal_avisos')
      const avs = app.findRecordsByFilter(colAv, "origem!='fixture'", '-criado_em', 1, 0)
      if (avs && avs.length > 0) {
        ultimoMotivo = String(avs[0].get('motivo') || '')
        motivoOrigem = String(avs[0].get('origem') || '')
      }
    } catch (eAv) {}
    return e.json(200, {
      ok: true,
      canal: {
        ultimo_consumo_em: c.get('ultimo_consumo_em'),
        ultimo_motivo: ultimoMotivo,
        motivo_origem: motivoOrigem,
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
  const hojeRef = /^\d{4}-\d{2}-\d{2}$/.test(String(body.agora || ''))
    ? String(body.agora)
    : new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  ;(function rn03fix() {
    try {
      const colPol3 = app.findCollectionByNameOrId('analysis_policy')
      const politicas3 = app.findRecordsByFilter(
        colPol3,
        "fixture=true && enabled=true && approved_at!=''",
        '',
        1,
        0,
      )
      if (!politicas3 || politicas3.length === 0) {
        resumo.avisos.push('RN-03: [fixture] politica sem gate — 0 eventos')
        return
      }
      const pol3 = politicas3[0]
      const dia3 = Number(hojeRef.slice(8, 10))
      let inicio3 = ''
      let fim3 = ''
      if (dia3 >= 16) {
        inicio3 = hojeRef.slice(0, 7) + '-01'
        fim3 = hojeRef.slice(0, 7) + '-15'
      } else {
        const pAno3 = Number(hojeRef.slice(0, 4))
        const pMes3 = Number(hojeRef.slice(5, 7))
        const a2 = pMes3 === 1 ? pAno3 - 1 : pAno3
        const m2 = pMes3 === 1 ? 12 : pMes3 - 1
        const m2s = (m2 < 10 ? '0' : '') + m2
        inicio3 = a2 + '-' + m2s + '-16'
        fim3 = new Date(Date.UTC(a2, m2, 1) - 86400000).toISOString().slice(0, 10)
      }
      const diasPeriodo3 =
        Math.round(
          (new Date(fim3 + 'T00:00:00Z').getTime() - new Date(inicio3 + 'T00:00:00Z').getTime()) /
            86400000,
        ) + 1
      const colM3 = app.findCollectionByNameOrId('metricas_fixtures')
      const regs3 = app.findRecordsByFilter(
        colM3,
        "data >= '" + inicio3 + "' && data <= '" + fim3 + " 23:59:59.999Z'" + '',
        'data',
        2000,
        0,
      )
      const porCanal3 = {}
      const campanhas3 = {}
      const indicadores3 = {}
      for (const r of regs3) {
        const c3 = String(r.get('canal') || '')
        if (!porCanal3[c3]) porCanal3[c3] = {}
        porCanal3[c3][String(r.get('data')).slice(0, 10)] = true
        const cid3 = String(r.get('campanha_id') || '')
        if (cid3) campanhas3[cid3] = true
        const chave3 =
          c3 +
          '|' +
          String(r.get('objetivo') || 'nao_informado') +
          '|' +
          String(r.get('natureza') || 'pago')
        if (!indicadores3[chave3])
          indicadores3[chave3] = { gasto: 0, cliques: 0, impressoes: 0, alcance: 0, resultados: 0 }
        const n3 = function (v) {
          const x = Number(v)
          return Number.isFinite(x) ? x : 0
        }
        indicadores3[chave3].gasto += n3(r.get('gasto'))
        indicadores3[chave3].cliques += n3(r.get('cliques'))
        indicadores3[chave3].impressoes += n3(r.get('impressoes'))
        indicadores3[chave3].alcance += n3(r.get('alcance'))
        indicadores3[chave3].resultados += n3(r.get('resultados'))
      }
      const cobertura3 = []
      const faltas3 = []
      let completa3 = true
      for (const c3 of ['meta_ads', 'google_ads']) {
        const dias3 = porCanal3[c3] ? Object.keys(porCanal3[c3]).length : 0
        cobertura3.push({ canal: c3, dias: dias3, esperados: diasPeriodo3 })
        if (dias3 < diasPeriodo3) {
          completa3 = false
          faltas3.push(c3 + ' ' + dias3 + '/' + diasPeriodo3)
        }
      }
      function motivoCanal3(txt) {
        try {
          const colA3 = app.findCollectionByNameOrId('canal_avisos')
          const a3 = new Record(colA3)
          a3.set('motivo', ('[fixture] ' + txt).slice(0, 300))
          a3.set('origem', 'fixture')
          a3.set('criado_em', new Date().toISOString())
          app.save(a3)
        } catch (eM3) {}
      }
      if (!completa3) {
        motivoCanal3('cobertura incompleta ' + inicio3 + '..' + fim3 + ': ' + faltas3.join(', '))
        resumo.avisos.push(
          'RN-03: [fixture] cobertura incompleta — 0 eventos (' + faltas3.join(', ') + ')',
        )
        return
      }
      let gatilho3 = ''
      try {
        const colR3 = app.findCollectionByNameOrId('reports')
        const rr3 = app.findRecordsByFilter(
          colR3,
          "period_start='" +
            inicio3 +
            "' && period_end='" +
            fim3 +
            "' && scope='fixture' && report_revision=1",
          '',
          1,
          0,
        )
        if (rr3 && rr3.length > 0) gatilho3 = rr3[0].id
      } catch (eR3) {}
      const tipos3 = ['diagnostico_periodo']
      if (Object.keys(campanhas3).length > 0) {
        tipos3.push('parecer_campanha')
        tipos3.push('parecer_criativo')
      }
      if (gatilho3) tipos3.push('resumo_relatorio')
      const instrucoes3 =
        String(pol3.get('instrucoes_padrao') || '') +
        (gatilho3
          ? ' Produza tambem o resumo do relatorio (tipo resumo_relatorio, alvo_ref=' +
            gatilho3 +
            '), ate 2.500 caracteres, apenas fatos citaveis do relatorio.'
          : '') +
        ' Tipos esperados: ' +
        tipos3.join(', ') +
        '.'
      const dedupe3 = 'fixture|' + 'periodo_fechado|' + inicio3 + '|' + fim3 + '|*'
      const colE3 = app.findCollectionByNameOrId('analysis_events')
      const ex3 = app.findRecordsByFilter(colE3, "dedupe_key='" + dedupe3 + "'", '', 1, 0)
      if (ex3 && ex3.length > 0) {
        resumo.avisos.push(
          'RN-03: [fixture] evento ja existe (idempotente) — ' + inicio3 + '..' + fim3,
        )
        return
      }
      const maxEv3 = Number(pol3.get('max_eventos_automaticos_por_mes') || 0)
      if (maxEv3 > 0) {
        const doMes3 = app.findRecordsByFilter(
          colE3,
          "tipo='periodo_fechado' && fixture=true && period_start >= '" +
            hojeRef.slice(0, 7) +
            "-01' && period_start <= '" +
            hojeRef.slice(0, 7) +
            "-31'",
          '',
          100,
          0,
        )
        if (doMes3.length >= maxEv3) {
          motivoCanal3('teto mensal de eventos automaticos ' + doMes3.length + '/' + maxEv3)
          resumo.avisos.push(
            'RN-03: [fixture] teto mensal ' + doMes3.length + '/' + maxEv3 + ' — 0 eventos',
          )
          return
        }
      }
      const ev3 = new Record(colE3)
      ev3.set('uuid', 'evt-auto-fixture-' + inicio3 + '-' + fim3)
      ev3.set('tipo', 'periodo_fechado')
      if (gatilho3) ev3.set('gatilho_ref', gatilho3)
      ev3.set('period_start', inicio3)
      ev3.set('period_end', fim3)
      ev3.set('scope', JSON.stringify({ contas: [], canais: [] }))
      ev3.set('tipos_esperados', JSON.stringify(tipos3))
      ev3.set(
        'payload_resumo',
        JSON.stringify({
          cobertura: cobertura3,
          indicadores: indicadores3,
          campanhas: Object.keys(campanhas3),
        }),
      )
      ev3.set('instrucoes', instrucoes3)
      ev3.set('dados_parciais', false)
      ev3.set('estado', 'pendente')
      ev3.set('dedupe_key', dedupe3)
      ev3.set('created_by', 'system')
      ev3.set('fixture', true)
      app.save(ev3)
      resumo.eventos_criados = (Number(resumo.eventos_criados) || 0) + 1
      resumo.avisos.push(
        'RN-03: [fixture] evento criado ' +
          inicio3 +
          '..' +
          fim3 +
          (gatilho3 ? ' (gatilho_ref ok)' : ''),
      )
    } catch (eRn3) {
      resumo.avisos.push('RN-03 erro: ' + String(eRn3).slice(0, 120))
    }
  })()
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

// ==================== POST /backend/v1/analises/eventos (pedido manual, RN-07) ====================
routerAdd('POST', '/backend/v1/analises/eventos', (e) => {
  if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
  const app = $app
  const body = e.requestInfo().body || {}
  const hojeRef = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  let email = ''
  try {
    email = String(e.auth.get('email') || '')
  } catch (eEm) {}
  const ehFixture = email.indexOf('criterios.fixture.') === 0 || email.indexOf('marketing.') === 0
  const colPol = app.findCollectionByNameOrId('analysis_policy')
  const politicas = app.findRecordsByFilter(
    colPol,
    ehFixture ? 'fixture=true' : 'fixture=false',
    '',
    1,
    0,
  )
  if (!politicas || politicas.length === 0)
    return e.json(422, { ok: false, erro: 'política de análise indisponível' })
  const pol = politicas[0]
  if (pol.get('enabled') !== true)
    return e.json(422, { ok: false, erro: 'política de análise desabilitada' })
  if (String(pol.get('approved_at') || '') === '')
    return e.json(422, { ok: false, erro: 'política de análise sem aprovação' })
  if (pol.get('permitir_solicitacao_manual') !== true)
    return e.json(422, { ok: false, erro: 'pedido manual desabilitado pela política' })
  const colG = app.findCollectionByNameOrId('access_grants')
  const meus = app.findRecordsByFilter(
    colG,
    "user_id='" + e.auth.id + "' && revoked_at=''",
    '',
    50,
    0,
  )
  let temReq = false
  const gContas = []
  const gCanais = []
  for (const g of meus) {
    const ate = String(g.get('valid_until') || '')
    if (ate !== '' && ate.slice(0, 10) < hojeRef) continue
    let acts = []
    try {
      const raw = g.get('actions')
      acts =
        Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number'
          ? JSON.parse(String.fromCharCode.apply(null, raw))
          : typeof raw === 'string'
            ? JSON.parse(raw)
            : raw || []
    } catch (e2) {}
    if (acts.indexOf('request_analysis') < 0) continue
    temReq = true
    let sa = []
    try {
      const ra = g.get('scope_accounts')
      sa =
        Array.isArray(ra) && ra.length > 0 && typeof ra[0] === 'number'
          ? JSON.parse(String.fromCharCode.apply(null, ra))
          : typeof ra === 'string'
            ? JSON.parse(ra)
            : ra || []
    } catch (e3) {}
    let sc = []
    try {
      const rc = g.get('scope_channels')
      sc =
        Array.isArray(rc) && rc.length > 0 && typeof rc[0] === 'number'
          ? JSON.parse(String.fromCharCode.apply(null, rc))
          : typeof rc === 'string'
            ? JSON.parse(rc)
            : rc || []
    } catch (e4) {}
    for (const c of sa) if (gContas.indexOf(String(c)) < 0) gContas.push(String(c))
    for (const c of sc) if (gCanais.indexOf(String(c)) < 0) gCanais.push(String(c))
  }
  if (!temReq)
    return e.json(403, {
      ok: false,
      erro: 'sem permissão para pedir análise (request_analysis) — fale com o administrador',
    })
  const gTudo = gContas.indexOf('*') >= 0 && gCanais.indexOf('*') >= 0
  let ps = String(body.period_start || '')
  let pe = String(body.period_end || '')
  if (ps === '' || pe === '') {
    const diaH = Number(hojeRef.slice(8, 10))
    if (diaH >= 16) {
      ps = hojeRef.slice(0, 7) + '-01'
      pe = hojeRef.slice(0, 7) + '-15'
    } else {
      const pAno = Number(hojeRef.slice(0, 4))
      const pMes = Number(hojeRef.slice(5, 7))
      const a2 = pMes === 1 ? pAno - 1 : pAno
      const m2 = pMes === 1 ? 12 : pMes - 1
      const m2s = (m2 < 10 ? '0' : '') + m2
      ps = a2 + '-' + m2s + '-16'
      pe = new Date(Date.UTC(a2, m2, 1) - 86400000).toISOString().slice(0, 10)
    }
  }
  const reData = /^\d{4}-\d{2}-\d{2}$/
  const erros = {}
  if (!reData.test(ps)) erros.period_start = 'formato AAAA-MM-DD'
  if (!reData.test(pe)) erros.period_end = 'formato AAAA-MM-DD'
  if (Object.keys(erros).length === 0 && ps > pe) erros.period_start = 'início após o fim'
  if (Object.keys(erros).length > 0)
    return e.json(422, { ok: false, erro: 'entrada inválida', campos: erros })
  let scopeEv = null
  const bScope = body.scope
  if (bScope === undefined || bScope === null || bScope === '') {
    scopeEv = gTudo ? '*' : { contas: gContas, canais: gCanais }
  } else if (bScope === '*') {
    if (!gTudo)
      return e.json(422, {
        ok: false,
        erro: 'scope_fora_do_grant',
        detalhe: 'seu acesso não cobre todos os canais/contas',
      })
    scopeEv = '*'
  } else if (typeof bScope === 'object') {
    const bC = (bScope && bScope.contas) || []
    const bK = (bScope && bScope.canais) || []
    for (const c of bC) {
      if (gContas.indexOf('*') < 0 && gContas.indexOf(String(c)) < 0)
        return e.json(422, {
          ok: false,
          erro: 'scope_fora_do_grant',
          detalhe: 'conta fora do seu escopo: ' + String(c).slice(0, 40),
        })
    }
    for (const c of bK) {
      if (gCanais.indexOf('*') < 0 && gCanais.indexOf(String(c)) < 0)
        return e.json(422, {
          ok: false,
          erro: 'scope_fora_do_grant',
          detalhe: 'canal fora do seu escopo: ' + String(c).slice(0, 40),
        })
    }
    let evC = bC.map(String)
    let evK = bK.map(String)
    if (!gTudo) {
      if (evC.length === 0) evC = gContas
      if (evK.length === 0) evK = gCanais
    }
    scopeEv = evC.length === 0 && evK.length === 0 && gTudo ? '*' : { contas: evC, canais: evK }
  } else {
    return e.json(422, {
      ok: false,
      erro: 'entrada inválida',
      campos: { scope: 'objeto {contas, canais} ou "*"' },
    })
  }
  const scopeStr = scopeEv === '*' ? '"*"' : JSON.stringify(scopeEv)
  const scopeHash =
    scopeEv === '*'
      ? '*'
      : JSON.stringify({
          contas: scopeEv.contas.slice().sort(),
          canais: scopeEv.canais.slice().sort(),
        })
  const dedupe =
    (ehFixture ? 'fixture|' : '') + 'solicitacao_manual|' + ps + '|' + pe + '|' + scopeHash
  const colE = app.findCollectionByNameOrId('analysis_events')
  const ex = app.findRecordsByFilter(colE, "dedupe_key='" + dedupe + "'", '', 1, 0)
  if (ex && ex.length > 0) {
    const ev0 = ex[0]
    return e.json(200, {
      ok: true,
      replay: true,
      evento: {
        id: ev0.id,
        uuid: ev0.get('uuid'),
        tipo: ev0.get('tipo'),
        period_start: ev0.get('period_start'),
        period_end: ev0.get('period_end'),
        estado: ev0.get('estado'),
        dados_parciais: ev0.get('dados_parciais') === true,
        motivo_parcial: ev0.get('motivo_parcial') || '',
        fixture: ev0.get('fixture') === true,
      },
    })
  }
  const maxM = Number(pol.get('max_manuais_por_mes') || 0)
  if (maxM > 0) {
    const doMes = app.findRecordsByFilter(
      colE,
      "tipo='solicitacao_manual' && created_by='" +
        e.auth.id +
        "' && created >= '" +
        hojeRef.slice(0, 7) +
        "-01 00:00:00.000Z'",
      '',
      100,
      0,
    )
    if (doMes.length >= maxM)
      return e.json(422, {
        ok: false,
        erro: 'limite de pedidos manuais excedido',
        detalhe: doMes.length + '/' + maxM,
      })
  }
  let parcial = false
  let motivo = ''
  const totalDias =
    Math.round(
      (new Date(pe + 'T00:00:00Z').getTime() - new Date(ps + 'T00:00:00Z').getTime()) / 86400000,
    ) + 1
  if (pe >= hojeRef) {
    const decorridos = Math.max(
      Math.round(
        (new Date(hojeRef + 'T00:00:00Z').getTime() - new Date(ps + 'T00:00:00Z').getTime()) /
          86400000,
      ) + 1,
      0,
    )
    parcial = true
    motivo = 'período em curso — ' + decorridos + ' de ' + totalDias + ' dias'
  } else {
    const colM = app.findCollectionByNameOrId(ehFixture ? 'metricas_fixtures' : 'metricas_diarias')
    const regs = app.findRecordsByFilter(
      colM,
      "data >= '" + ps + "' && data <= '" + pe + "'" + (ehFixture ? '' : " && origem='api'"),
      'data',
      2000,
      0,
    )
    const porCanal = {}
    for (const r of regs) {
      const c = String(r.get('canal') || '')
      if (!porCanal[c]) porCanal[c] = {}
      porCanal[c][String(r.get('data')).slice(0, 10)] = true
    }
    const faltas = []
    for (const c of ['meta_ads', 'google_ads']) {
      const dias = porCanal[c] ? Object.keys(porCanal[c]).length : 0
      if (dias < totalDias) faltas.push(c + ' ' + dias + '/' + totalDias)
    }
    if (faltas.length > 0) {
      parcial = true
      motivo = 'cobertura incompleta — ' + faltas.join(', ')
    }
  }
  const uuidV4M = function () {
    const h = '0123456789abcdef'
    let u = ''
    for (let i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) u += '-'
      else if (i === 14) u += '4'
      else if (i === 19) u += h[8 + Math.floor(Math.random() * 4)]
      else u += h[Math.floor(Math.random() * 16)]
    }
    return u
  }
  const ev = new Record(colE)
  ev.set('uuid', uuidV4M())
  ev.set('tipo', 'solicitacao_manual')
  ev.set('period_start', ps)
  ev.set('period_end', pe)
  ev.set('scope', scopeStr)
  ev.set('tipos_esperados', JSON.stringify(['diagnostico_periodo']))
  ev.set('instrucoes', String(pol.get('instrucoes_padrao') || ''))
  ev.set('dados_parciais', parcial)
  if (motivo) ev.set('motivo_parcial', motivo.slice(0, 500))
  ev.set('estado', 'pendente')
  ev.set('dedupe_key', dedupe)
  ev.set('created_by', e.auth.id)
  ev.set('fixture', ehFixture)
  app.save(ev)
  return e.json(200, {
    ok: true,
    evento: {
      id: ev.id,
      uuid: ev.get('uuid'),
      tipo: 'solicitacao_manual',
      period_start: ps,
      period_end: pe,
      estado: 'pendente',
      dados_parciais: parcial,
      motivo_parcial: motivo,
      fixture: ehFixture,
    },
  })
})

// ---------- POST /backend/v1/fixtures/seed-card3 (métricas/relatório/política fixture p/ CA-3-03) ----------
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
  if (esperado === '' || recebido === '' || esperado !== recebido)
    return e.json(404, { ok: false, erro: 'rota não encontrada' })
  const app = $app
  const body = e.requestInfo().body || {}
  const cobertura = String(body.cobertura || '')
  const politica = String(body.politica || '')
  const criarRelatorio = body.relatorio === true
  const colM = app.findCollectionByNameOrId('metricas_fixtures')
  let removidos = 0
  if (cobertura === 'limpar' || cobertura === 'completa' || cobertura === 'incompleta') {
    const antigos = app.findRecordsByFilter(
      colM,
      "data >= '2026-11-01 00:00:00.000Z' && data <= '2026-11-15 23:59:59.999Z'",
      '',
      500,
      0,
    )
    for (const r of antigos) {
      app.delete(r)
      removidos++
    }
  }
  let criados = 0
  if (cobertura === 'completa' || cobertura === 'incompleta') {
    for (let d = 1; d <= 15; d++) {
      const data = '2026-11-' + (d < 10 ? '0' + d : '' + d) + ' 00:00:00.000Z'
      const linhas = [
        {
          canal: 'meta_ads',
          conta: 'ACC_A',
          camp: 'CMP_FIX_A',
          gasto: 100 + d,
          cliques: 40 + d,
          impressoes: 4000 + d * 10,
          alcance: 3000 + d * 5,
          resultados: 5 + (d % 3),
          objetivo: 'leads',
        },
        {
          canal: 'google_ads',
          conta: 'ACC_B',
          camp: 'CMP_FIX_B',
          gasto: 50 + d,
          cliques: 20 + d,
          impressoes: 2000 + d * 5,
          alcance: 1500 + d * 3,
          resultados: 3 + (d % 2),
          objetivo: 'trafico',
        },
      ]
      for (const L of linhas) {
        if (cobertura === 'incompleta' && L.canal === 'google_ads' && d === 15) continue
        const r = new Record(colM)
        r.set('canal', L.canal)
        r.set('conta_id', L.conta)
        r.set('conta_nome', 'Conta ' + L.conta)
        r.set('campanha_id', L.camp)
        r.set('campanha_nome', 'Campanha ' + L.camp)
        r.set('objetivo', L.objetivo)
        r.set('natureza', 'pago')
        r.set('data', data)
        r.set('alcance', L.alcance)
        r.set('impressoes', L.impressoes)
        r.set('cliques', L.cliques)
        r.set('gasto', L.gasto)
        r.set('resultados', L.resultados)
        r.set('origem', 'fixture')
        r.set('fixture', true)
        app.save(r)
        criados++
      }
    }
  }
  let politicaEstado = ''
  if (politica !== '') {
    const colPol = app.findCollectionByNameOrId('analysis_policy')
    const pss = app.findRecordsByFilter(colPol, 'fixture=true', '', 1, 0)
    if (pss && pss.length > 0) {
      const p = pss[0]
      if (politica === 'ok') {
        p.set('enabled', true)
        p.set('approved_at', new Date().toISOString())
      } else if (politica === 'desabilitada') {
        p.set('enabled', false)
      } else if (politica === 'sem_aprovacao') {
        p.set('enabled', true)
        p.set('approved_at', '')
      }
      app.save(p)
      politicaEstado = politica
    }
  }
  let relatorioId = ''
  if (criarRelatorio) {
    const colR = app.findCollectionByNameOrId('reports')
    const exR = app.findRecordsByFilter(
      colR,
      "period_start='2026-11-01' && period_end='2026-11-15' && scope='fixture' && report_revision=1",
      '',
      1,
      0,
    )
    if (exR && exR.length > 0) {
      relatorioId = exR[0].id
    } else {
      try {
        const rec = new Record(colR)
        rec.set('uuid', 'rep-fixture-card3-2026-11-01-15')
        rec.set('period_start', '2026-11-01')
        rec.set('period_end', '2026-11-15')
        rec.set('quinzena', 1)
        rec.set('scope', 'fixture')
        rec.set('template_version', '1.0.0')
        rec.set('policy_version', '1')
        rec.set('report_revision', 1)
        rec.set('generated_at', new Date().toISOString())
        rec.set('state', 'delivered')
        rec.set('origem', 'api')
        rec.set('data_snapshot_json', JSON.stringify({ fixture: true }))
        rec.set(
          'coverage_by_source',
          JSON.stringify({
            janela_dias: 15,
            canais: [
              { canal: 'meta_ads', dias: 15 },
              { canal: 'google_ads', dias: 15 },
            ],
          }),
        )
        rec.set('comparison_eligibility', JSON.stringify({}))
        rec.set('warnings', JSON.stringify([]))
        rec.set('alert_refs', JSON.stringify({ aviso: 'fixture card 3', itens: [] }))
        rec.set('decision_refs', JSON.stringify([]))
        app.save(rec)
        relatorioId = rec.id
      } catch (eRep) {
        relatorioId = ''
      }
    }
  }
  return e.json(200, {
    ok: true,
    removidos: removidos,
    criados: criados,
    politica: politicaEstado,
    relatorio_id: relatorioId,
  })
})
