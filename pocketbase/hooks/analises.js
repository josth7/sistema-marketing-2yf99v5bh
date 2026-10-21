/// <reference path="../pb_data/types.d.ts" />
/**
 * Hooks do canal Maestro↔sistema — PARTE 1 (SPEC-3-001, card 6b8c8de9).
 * PARTE 2 (tick RN-03/reentrega + fixtures) está em analises_canal.js.
 *
 * SEGURANÇA (RN-01): toda rota do Maestro valida
 *   material = timestamp + "." + MÉTODO + "." + caminho_com_id + "." + corpo
 *   GET: corpo = query string EXATAMENTE como recebida (sem query = "")
 *   POST: corpo = JSON canônico (chaves ordenadas, sem espaços) do pedido
 *   assinado com HMAC-SHA256 do segredo compartilhado (MAESTRO_SHARED_SECRET),
 *   janela de ±300s, comparação constante, unicode LITERAL no JSON canônico.
 *
 * RN-02: pull (pendente → entregue), consumo com reentrega (RN-08: 3 ciclos →
 * erro_definitivo), conclusão idempotente (RN-09), erro com motivo (RN-10).
 * RN-07: pedido manual POST /analises/eventos (request_analysis + escopo do
 * grant + teto mensal + dados_parciais com motivo + replay idempotente).
 * RN-11 (SPEC-3-002): parecer de campanha/criativo exige >= 1 evidência válida
 * (metrica/imagem/copy/página existentes no período do evento) — 422
 * parecer_sem_evidencia. dados_externos (SPEC-3-002): o evento carrega os
 * anúncios do período com criativo/página/métricas — DADO para a IA, nunca
 * instrução (RN-04/RN-16).
 *
 * JSVM: lógica INLINE nos callbacks; $os.env NÃO existe — segredos via
 * $secrets.get; e.request.url().rawQuery lança — query via e.request.requestURI;
 * routerAdd sem 4º argumento (middleware null lança na carga).
 */

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
    const colAnc = app.findCollectionByNameOrId('anuncios_criativos')
    const colPg = app.findCollectionByNameOrId('paginas_destino')
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
  // replay: mesmo trio com texto IGUAL devolve a mesma análise
  const colA = app.findCollectionByNameOrId('analises')
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
})
