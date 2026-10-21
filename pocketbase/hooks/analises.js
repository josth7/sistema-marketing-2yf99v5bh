/// <reference path="../pb_data/types.d.ts" />
/**
 * Rotas de canal (SPEC-3-001): pull GET /analises/eventos (assinado) e
 * POST /analises (IA grava, com RN-11 da SPEC-3-002). Divisão só para caber
 * no transporte de gravação. Consumir/concluir/erro estão em analises_api.js.
 */

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
    return e.json(503, {
      ok: false,
      erro: 'canal_indisponivel',
      detalhe: 'segredo não configurado',
    })
  }
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
  const requestURI = String(e.request.requestURI || '')
  const posQ = requestURI.indexOf('?')
  const query = posQ >= 0 ? requestURI.slice(posQ + 1) : ''
  const caminho = '/backend/v1/analises/eventos'
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
  const colE = app.findCollectionByNameOrId('analysis_events')
  const pendentes = app.findRecordsByFilter(colE, "estado='pendente'", '-created', 20, 0)
  const itens = []
  for (const ev of pendentes) {
    itens.push({
      id: ev.id,
      uuid: ev.get('uuid'),
      origem: ev.get('origem'),
      period_start: ev.get('period_start'),
      period_end: ev.get('period_end'),
      scope: parseTol(ev.get('scope')),
      tipos_esperados: parseTol(ev.get('tipos_esperados')),
      instrucoes: ev.get('instrucoes') || '',
      payload_resumo: parseTol(ev.get('payload_resumo')),
      dados_externos: parseTol(ev.get('dados_externos')),
    })
  }
  return e.json(200, { ok: true, itens: itens })
})

// ==================== POST /backend/v1/analises (IA grava análise — canal assinado) ====================
routerAdd('POST', '/backend/v1/analises', (e) => {
  const app = $app
  let seg = ''
  try {
    const v = $secrets.get('MAESTRO_SHARED_SECRET')
    if (v) seg = String(v)
  } catch (eS) {}
  if (!seg) {
    try {
      const colC0 = app.findCollectionByNameOrId('canal_estado')
      const recs0 = app.findRecordsByFilter(colC0, '', '', 1, 0)
      if (recs0 && recs0.length > 0) seg = String(recs0[0].get('segredo_teste') || '')
    } catch (eC0) {}
  }
  if (!seg) {
    return e.json(503, {
      ok: false,
      erro: 'canal_indisponivel',
      detalhe: 'segredo não configurado',
    })
  }
  const tsHeader = String(e.request.header.get('X-Maestro-Timestamp') || '')
  const sigHeader = String(e.request.header.get('X-Maestro-Signature') || '')
  const agora = Math.floor(Date.now() / 1000)
  const ts = Number(tsHeader)
  if (!tsHeader || !Number.isFinite(ts) || Math.abs(agora - ts) > 300) {
    return e.json(401, { ok: false, erro: 'timestamp ausente ou fora da janela de 300s' })
  }
  const requestURI = String(e.request.requestURI || '')
  const caminho = requestURI.split('?')[0]
  const corpoBruto = (function () {
    try {
      const b = e.requestInfo().body
      if (!b) return ''
      return (function canon(o) {
        if (o === null) return 'null'
        if (Array.isArray(o)) {
          const partes = []
          for (const v of o) partes.push(canon(v))
          return '[' + partes.join(',') + ']'
        }
        if (typeof o === 'object') {
          const chaves = []
          for (const k in o) {
            if (Object.prototype.hasOwnProperty.call(o, k)) chaves.push(k)
          }
          chaves.sort()
          const partes = []
          for (const k of chaves) {
            partes.push(JSON.stringify(k) + ':' + canon(o[k]))
          }
          return '{' + partes.join(',') + '}'
        }
        return JSON.stringify(o)
      })(b)
    } catch (eJ) {
      return ''
    }
  })()
  const material = tsHeader + '.POST.' + caminho + '.' + corpoBruto
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
  const b = body || {}
  const eventRef = String(b.event_id || '').trim()
  const tipo = String(b.tipo || '').trim()
  const alvoRef = String(b.alvo_ref || '').trim()
  const conteudo = String(b.conteudo || '')
  const modelo = String(b.modelo || '').slice(0, 120)
  const evidencias = b.evidencias
  let resumo_info = null
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
  // RN-11 (SPEC-3-002): parecer exige >= 1 evidencia valida
  if (tipo === 'parecer_campanha' || tipo === 'parecer_criativo') {
    const listaEv = Array.isArray(evidencias) ? evidencias : []
    let valida = false
    const pStartE = String(ev.get('period_start') || '')
    const pEndE = String(ev.get('period_end') || '')
    let colAnc = null
    let colPg = null
    try {
      colAnc = app.findCollectionByNameOrId('anuncios_criativos')
      colPg = app.findCollectionByNameOrId('paginas_destino')
    } catch (eCols) {
      return e.json(500, { ok: false, erro: 'falha_rn11', detalhe: String(eCols).slice(0, 200) })
    }
    for (let i = 0; i < listaEv.length; i++) {
      const evi = listaEv[i] || {}
      const tEv = String(evi.tipo || '')
      const refE = String(evi.ref || '')
      if (!refE) continue
      if (tEv === 'metrica') {
        try {
          const rs = app.findRecordsByFilter(
            app.findCollectionByNameOrId('metricas_diarias_anuncio'),
            "anuncio_id='" +
              refE.replace(/'/g, '') +
              "' && data >= '" +
              pStartE +
              "' && data <= '" +
              pEndE +
              " 23:59:59.999Z'",
            '',
            1,
            0,
          )
          if (rs && rs.length > 0) valida = true
        } catch (eM) {}
      } else if (tEv === 'imagem' || tEv === 'copy') {
        try {
          const rs = app.findRecordsByFilter(
            colAnc,
            "anuncio_id='" + refE.replace(/'/g, '') + "'",
            '',
            1,
            0,
          )
          if (rs && rs.length > 0) {
            const anc = rs[0]
            if (tEv === 'imagem') {
              if (String(anc.get('thumbnail_url') || '') || String(anc.get('imagem_url') || ''))
                valida = true
            } else {
              const trecho = String(evi.trecho_ou_url || '')
              const tit = String(anc.get('titulo') || '')
              const cor = String(anc.get('corpo') || '')
              if (trecho && (tit.indexOf(trecho) >= 0 || cor.indexOf(trecho) >= 0)) valida = true
            }
          }
        } catch (eA) {}
      } else if (tEv === 'pagina') {
        try {
          const rs = app.findRecordsByFilter(
            colPg,
            "url='" + String(evi.trecho_ou_url || '').replace(/'/g, '') + "'",
            '',
            1,
            0,
          )
          if (rs && rs.length > 0) valida = true
        } catch (eP2) {}
      }
      if (valida) break
    }
    if (!valida) {
      return e.json(422, {
        ok: false,
        erro: 'parecer_sem_evidencia',
        campos: { evidencias: 'nenhuma evidência válida no período/escopo do evento' },
        indice: 0,
      })
    }
  }
  // RN-22 (SPEC-3-003): resumo_relatorio cria report_ai_summaries + caixa dos revisores
  if (tipo === 'resumo_relatorio') {
    // alvo_ref = gatilho_ref do evento = report_id (obrigatório)
    if (alvoRef === '') {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { alvo_ref: 'obrigatório para resumo_relatorio (report_id)' },
      })
    }
    let rep = null
    try {
      rep = app.findRecordById('reports', alvoRef)
    } catch (_) {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { alvo_ref: 'relatório não encontrado' },
      })
    }
    // resumo já existe p/ este relatório?
    const colSum = app.findCollectionByNameOrId('report_ai_summaries')
    const exSum = app.findRecordsByFilter(
      colSum,
      "report_id='" + rep.id + "' && event_id='" + ev.id + "'",
      '',
      1,
      0,
    )
    if (exSum && exSum.length > 0) {
      const anterior = exSum[0]
      const estadoAnt = String(anterior.get('estado') || '')
      if (estadoAnt === 'aprovado' || estadoAnt === 'editado') {
        return e.json(409, {
          ok: false,
          erro: 'analise_ja_registrada',
          detalhe: 'resumo já ' + estadoAnt,
        })
      }
      // aguardando_revisao: replay com texto igual → 200; diferente → 409
      const rascAnt = String(anterior.get('rascunho') || '')
      if (rascAnt === conteudoTrim) {
        return e.json(200, {
          ok: true,
          replay: true,
          analysis_id: anterior.get('analysis_id'),
          summary_id: anterior.id,
          estado: estadoAnt,
        })
      }
      return e.json(409, {
        ok: false,
        erro: 'analise_ja_registrada',
        detalhe: 'resumo aguardando revisão com texto diferente',
      })
    }
    // política de resumo (fixture ou real)
    const colPolS = app.findCollectionByNameOrId('ai_summary_policy')
    const fixtureEv = ev.get('fixture') === true
    const polsS = app.findRecordsByFilter(
      colPolS,
      fixtureEv ? 'fixture=true' : 'fixture=false',
      '',
      1,
      0,
    )
    const polS = polsS && polsS.length > 0 ? polsS[0] : null
    const prazoHoras = polS ? Number(polS.get('prazo_revisao_horas') || 48) : 48
    const prazoISO = new Date(Date.now() + prazoHoras * 3600 * 1000).toISOString()
    const agoraISO2 = new Date().toISOString()
    const sum = new Record(colSum)
    sum.set(
      'uuid',
      'sum-' + agoraISO2.replace(/[-:TZ.]/g, '') + '-' + Math.floor(Math.random() * 900 + 100),
    )
    sum.set('report_id', rep.id)
    sum.set('event_id', ev.id)
    sum.set('estado', 'aguardando_revisao')
    sum.set('rascunho', conteudoTrim)
    sum.set('prazo_revisao_em', prazoISO)
    sum.set('fixture', fixtureEv)
    app.save(sum)
    // vincula a análise ao resumo (depois do save p/ ter o id)
    // (analysis_id é setado na análise abaixo via update)
    // itens de caixa revisao_resumo — só revisores com grant review_ai_summary válido
    const colGrS = app.findCollectionByNameOrId('access_grants')
    const colU2 = app.findCollectionByNameOrId('users')
    const colInbox = app.findCollectionByNameOrId('inbox_items')
    const grantsS = app.findRecordsByFilter(colGrS, "revoked_at=''", '', 200, 0)
    const revisores = {}
    for (const g of grantsS) {
      let acoes2 = []
      try {
        const rawA = g.get('actions')
        acoes2 =
          Array.isArray(rawA) && rawA.length > 0 && typeof rawA[0] === 'number'
            ? JSON.parse(String.fromCharCode.apply(null, rawA))
            : typeof rawA === 'string'
              ? JSON.parse(rawA)
              : rawA || []
      } catch (eA2) {}
      if (Array.isArray(acoes2) && acoes2.indexOf('review_ai_summary') < 0) continue
      // validade
      const vu = String(g.get('valid_until') || '')
      if (vu && new Date(vu.replace(' ', 'T')).getTime() < Date.now()) continue
      const uid = String(g.get('user_id') || '')
      if (!uid) continue
      revisores[uid] = true
    }
    let itensCriados = 0
    for (const uid in revisores) {
      // usuário fixture? só encaminha a usuários fixture quando o evento é fixture
      const us2 = app.findRecordsByFilter(colU2, "id='" + uid + "'", '', 1, 0)
      if (!us2 || us2.length === 0) continue
      const emailU = String(us2[0].get('email') || '')
      const ehFixture = emailU.indexOf('.fixture.') >= 0
      if (fixtureEv && !ehFixture) continue
      if (!fixtureEv && ehFixture) continue
      const dedupeKey = sum.id + '+' + uid
      const exItem = app.findRecordsByFilter(colInbox, "dedupe_key='" + dedupeKey + "'", '', 1, 0)
      if (exItem && exItem.length > 0) continue
      const item = new Record(colInbox)
      item.set('report_id', rep.id)
      item.set('user_id', uid)
      // tipo é select fechado da fase 2 — o tipo do item fica no scope (revisao_resumo)
      item.set('scope', 'revisao_resumo')
      item.set('status', 'pending')
      item.set('dedupe_key', dedupeKey)
      app.save(item)
      itensCriados++
    }
    resumo_info = { summary_id: sum.id, itens: itensCriados, prazo: prazoISO }
  }
  // replay: mesmo trio com texto IGUAL devolve a mesma análise
  const colA = app.findCollectionByNameOrId('analyses')
  let mesmoTrio = null
  try {
    mesmoTrio = app.findRecordsByFilter(
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
  } catch (eTrio) {
    return e.json(500, { ok: false, erro: 'falha_replay', detalhe: String(eTrio).slice(0, 200) })
  }
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
  try {
    app.save(ana)
  } catch (eSave) {
    return e.json(500, { ok: false, erro: 'falha_gravacao', detalhe: String(eSave).slice(0, 200) })
  }
  // vincula o resumo à análise criada
  if (resumo_info) {
    try {
      const colSum2 = app.findCollectionByNameOrId('report_ai_summaries')
      const sumRec = app.findRecordById(colSum2, resumo_info.summary_id)
      sumRec.set('analysis_id', ana.id)
      app.save(sumRec)
    } catch (eLink) {}
  }
  return e.json(201, {
    ok: true,
    replay: false,
    analysis_id: ana.id,
    uuid: ana.get('uuid'),
    estado: 'rascunho',
    resumo: resumo_info,
  })
})
