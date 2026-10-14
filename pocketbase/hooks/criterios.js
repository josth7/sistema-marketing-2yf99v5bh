/**
 * Hooks do servidor — cadastro de critérios de alerta (SPEC-2-002, card fc6d0f5a).
 *
 * Rotas (todas autenticadas — $apis.requireAuth()):
 *   GET    /backend/v1/alert-criteria              → lista (opcional ?uuid= e ?state=)
 *   POST   /backend/v1/alert-criteria              → cria rascunho (ou edita o draft aberto da regra)
 *   PATCH  /backend/v1/alert-criteria/{id}         → edita rascunho com version esperado (409 divergente)
 *   POST   /backend/v1/alert-criteria/{id}/approve → aprova (422 incompleto, 403 quem criou)
 *   POST   /backend/v1/alert-criteria/{id}/archive → arquiva (rascunho ou aprovado)
 *
 * Regras da SPEC: rascunho pode nascer incompleto (campos presentes validados,
 * 422 com campo/motivo); aprovação exige TODOS os campos obrigatórios (422) e
 * ator com permissão (403 — quem criou não aprova a si mesmo; superuser passa);
 * aprovação grava approved_by/approved_at/version e PRESERVA o histórico.
 * Nenhum limiar padrão inventado — valores vêm do corpo da requisição.
 * JSVM: toda a lógica INLINE no callback.
 */
routerAdd(
  'GET',
  '/backend/v1/alert-criteria',
  (e) => {
    const col = $app.findCollectionByNameOrId('alert_criteria')
    let filtro = ''
    const qUuid = e.request.url.query().get('uuid') || ''
    const qState = e.request.url.query().get('state') || ''
    if (qUuid) filtro += "uuid='" + qUuid.replace(/'/g, '') + "'"
    if (qUuid && qState) filtro += ' && '
    if (qState) filtro += "state='" + qState.replace(/'/g, '') + "'"
    const registros = $app.findRecordsByFilter(col, filtro, '-created', 200, 0)
    const itens = []
    for (const r of registros) {
      itens.push({
        id: r.id,
        uuid: r.get('uuid'),
        version: r.get('version'),
        state: r.get('state'),
        metric: r.get('metric') || null,
        canal: r.get('canal') || null,
        objetivo: r.get('objetivo') || null,
        result_type: r.get('result_type') || null,
        natureza: r.get('natureza') || null,
        direction: r.get('direction') || null,
        threshold_pct: r.get('threshold_pct'),
        min_base: r.get('min_base'),
        period_kind: r.get('period_kind') || null,
        comparison_mode: r.get('comparison_mode') || null,
        responsible_user: r.get('responsible_user') || null,
        created_by: r.get('created_by') || null,
        approved_by: r.get('approved_by') || null,
        approved_at: r.get('approved_at') || null,
        history: r.get('history') || null,
        created: r.get('created'),
        updated: r.get('updated'),
      })
    }
    return e.json(200, { ok: true, itens: itens })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/alert-criteria',
  (e) => {
    const body = e.requestInfo().body || {}
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    // guard de permissão (SPEC-2-005, f9a2a3eb): manage_criteria
    {
      const hojeC = new Date().toISOString().slice(0, 10)
      const colG_C = $app.findCollectionByNameOrId('access_grants')
      const meusC = $app.findRecordsByFilter(
        colG_C,
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        50,
        0,
      )
      let temManage = false
      for (const g of meusC) {
        const ateC = String(g.get('valid_until') || '')
        if (ateC !== '' && ateC.slice(0, 10) < hojeC) continue
        let actsC = []
        try {
          const rawC = g.get('actions')
          if (Array.isArray(rawC) && rawC.length > 0 && typeof rawC[0] === 'number') {
            actsC = JSON.parse(String.fromCharCode.apply(null, rawC))
          } else if (typeof rawC === 'string') {
            actsC = JSON.parse(rawC)
          } else {
            actsC = rawC || []
          }
        } catch (eC) {}
        if (actsC.indexOf('manage_criteria') >= 0) temManage = true
      }
      if (!temManage && !e.hasSuperuserAuth()) {
        return e.json(403, {
          ok: false,
          erro: 'sem permissão para cadastrar critérios (manage_criteria) — fale com o administrador',
        })
      }
    }

    // ---- validação dos campos presentes (rascunho pode nascer incompleto) ----
    const LISTAS = {
      metric: [
        'gasto',
        'cliques',
        'impressoes',
        'alcance',
        'resultados',
        'cpc',
        'cpm',
        'ctr',
        'custo_por_resultado',
      ],
      canal: ['meta_ads', 'google_ads', 'meta_organico'],
      objetivo: ['alcance', 'trafico', 'engajamento', 'leads', 'vendas', 'video', 'nao_informado'],
      result_type: [
        'conversoes',
        'leads',
        'impressoes',
        'cliques',
        'alcance',
        'engajamento',
        'vendas',
        'video',
      ],
      natureza: ['pago', 'organico'],
      direction: ['increase', 'decrease'],
      period_kind: ['monthly', 'calendar_half'],
    }
    const erros = {}
    for (const campo in LISTAS) {
      const v = body[campo]
      if (v !== undefined && v !== null && v !== '' && LISTAS[campo].indexOf(v) === -1) {
        erros[campo] = 'valor inválido: use ' + LISTAS[campo].join(', ')
      }
    }
    if (body.threshold_pct !== undefined && body.threshold_pct !== null) {
      const n = Number(body.threshold_pct)
      if (typeof body.threshold_pct === 'boolean' || !isFinite(n) || n <= 0) {
        erros.threshold_pct = 'limiar deve ser um número maior que 0'
      }
    }
    if (body.min_base !== undefined && body.min_base !== null) {
      const n = Number(body.min_base)
      if (typeof body.min_base === 'boolean' || !isFinite(n) || n <= 0) {
        erros.min_base = 'base mínima deve ser um número maior que 0'
      }
    }
    if (Object.keys(erros).length > 0) {
      return e.json(422, { ok: false, erro: 'entrada inválida', campos: erros })
    }

    const col = $app.findCollectionByNameOrId('alert_criteria')

    // ---- versionamento: editar o draft aberto da regra; sem draft, nova versão ----
    let rec = null
    let versao = 1
    let uuid = ''
    if (body.uuid !== undefined && body.uuid !== null && body.uuid !== '') {
      uuid = String(body.uuid)
        .replace(/[^a-zA-Z0-9_-]/g, '')
        .slice(0, 36)
      const existentesAll = $app.findRecordsByFilter(col, "uuid='" + uuid + "'", '-version', 50, 0)
      for (const c of existentesAll) {
        if (String(c.get('state')) === 'draft') {
          rec = c
          versao = Number(c.get('version'))
          break
        }
      }
      if (!rec) {
        let max = 0
        for (const c of existentesAll) {
          if (Number(c.get('version')) > max) max = Number(c.get('version'))
        }
        versao = max + 1
      }
    } else {
      // uuid v4 simplificado gerado no servidor (sem dependência)
      const hex = '0123456789abcdef'
      let u = ''
      for (let i = 0; i < 36; i++) {
        if (i === 8 || i === 13 || i === 18 || i === 23) u += '-'
        else if (i === 14) u += '4'
        else if (i === 19) u += hex[8 + Math.floor(Math.random() * 4)]
        else u += hex[Math.floor(Math.random() * 16)]
      }
      uuid = u
      versao = 1
    }

    const ehNovo = !rec
    if (ehNovo) {
      rec = new Record(col)
      rec.set('uuid', uuid)
      rec.set('version', versao)
      rec.set('state', 'draft')
      rec.set('comparison_mode', 'closed_period_total')
      rec.set('created_by', e.auth.id)
    } else if (String(rec.get('state')) !== 'draft') {
      // editar aprovado/arquivado → nova versão draft (prova antiga intacta)
      rec = new Record(col)
      rec.set('uuid', uuid)
      rec.set('version', versao)
      rec.set('state', 'draft')
      rec.set('comparison_mode', 'closed_period_total')
      rec.set('created_by', e.auth.id)
    }

    function aplicar(campo, valor) {
      if (valor === undefined) return
      rec.set(campo, valor === null || valor === '' ? null : valor)
    }
    aplicar('metric', body.metric)
    aplicar('canal', body.canal)
    aplicar('objetivo', body.objetivo)
    aplicar('result_type', body.result_type)
    aplicar('natureza', body.natureza)
    aplicar('direction', body.direction)
    aplicar('period_kind', body.period_kind)
    if (body.threshold_pct !== undefined)
      rec.set('threshold_pct', body.threshold_pct === null ? null : Number(body.threshold_pct))
    if (body.min_base !== undefined)
      rec.set('min_base', body.min_base === null ? null : Number(body.min_base))
    if (body.responsible_user !== undefined)
      rec.set('responsible_user', body.responsible_user || null)

    let hist = []
    try {
      const h = rec.get('history')
      if (h && typeof h === 'string' && h.length > 2) hist = JSON.parse(h)
    } catch (_) {}
    hist.push({
      at: new Date().toISOString(),
      ator: e.auth.id,
      acao: ehNovo ? 'criou_rascunho_v' + versao : 'editou_rascunho_v' + versao,
    })
    rec.set('history', JSON.stringify(hist).slice(0, 1900000))

    $app.save(rec)
    return e.json(200, {
      ok: true,
      id: rec.id,
      uuid: rec.get('uuid'),
      version: rec.get('version'),
      state: rec.get('state'),
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'PATCH',
  '/backend/v1/alert-criteria/{id}',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    // guard de permissão (SPEC-2-005, f9a2a3eb): manage_criteria
    {
      const hojeP = new Date().toISOString().slice(0, 10)
      const colG_P = $app.findCollectionByNameOrId('access_grants')
      const meusP = $app.findRecordsByFilter(
        colG_P,
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        50,
        0,
      )
      let temManageP = false
      for (const g of meusP) {
        const ateP = String(g.get('valid_until') || '')
        if (ateP !== '' && ateP.slice(0, 10) < hojeP) continue
        let actsP = []
        try {
          const rawP = g.get('actions')
          if (Array.isArray(rawP) && rawP.length > 0 && typeof rawP[0] === 'number') {
            actsP = JSON.parse(String.fromCharCode.apply(null, rawP))
          } else if (typeof rawP === 'string') {
            actsP = JSON.parse(rawP)
          } else {
            actsP = rawP || []
          }
        } catch (eP) {}
        if (actsP.indexOf('manage_criteria') >= 0) temManageP = true
      }
      if (!temManageP && !e.hasSuperuserAuth()) {
        return e.json(403, {
          ok: false,
          erro: 'sem permissão para editar critérios (manage_criteria) — fale com o administrador',
        })
      }
    }
    const id = e.request.pathValue('id')
    const body = e.requestInfo().body || {}
    const col = $app.findCollectionByNameOrId('alert_criteria')
    let rec
    try {
      rec = $app.findRecordById(col, id)
    } catch (_) {
      return e.json(404, { ok: false, erro: 'critério não encontrado' })
    }
    if (String(rec.get('state')) !== 'draft') {
      return e.json(409, {
        ok: false,
        erro: 'só rascunho pode ser editado — aprovar/arquivar cria nova versão',
      })
    }
    if (body.version !== undefined && Number(body.version) !== Number(rec.get('version'))) {
      return e.json(409, {
        ok: false,
        erro: 'conflito de versão — recarregue e revise (esperado ' + rec.get('version') + ')',
      })
    }

    const LISTAS = {
      metric: [
        'gasto',
        'cliques',
        'impressoes',
        'alcance',
        'resultados',
        'cpc',
        'cpm',
        'ctr',
        'custo_por_resultado',
      ],
      canal: ['meta_ads', 'google_ads', 'meta_organico'],
      objetivo: ['alcance', 'trafico', 'engajamento', 'leads', 'vendas', 'video', 'nao_informado'],
      result_type: [
        'conversoes',
        'leads',
        'impressoes',
        'cliques',
        'alcance',
        'engajamento',
        'vendas',
        'video',
      ],
      natureza: ['pago', 'organico'],
      direction: ['increase', 'decrease'],
      period_kind: ['monthly', 'calendar_half'],
    }
    const erros = {}
    for (const campo in LISTAS) {
      const v = body[campo]
      if (v !== undefined && v !== null && v !== '' && LISTAS[campo].indexOf(v) === -1) {
        erros[campo] = 'valor inválido: use ' + LISTAS[campo].join(', ')
      }
    }
    if (body.threshold_pct !== undefined && body.threshold_pct !== null) {
      const n = Number(body.threshold_pct)
      if (typeof body.threshold_pct === 'boolean' || !isFinite(n) || n <= 0) {
        erros.threshold_pct = 'limiar deve ser um número maior que 0'
      }
    }
    if (body.min_base !== undefined && body.min_base !== null) {
      const n = Number(body.min_base)
      if (typeof body.min_base === 'boolean' || !isFinite(n) || n <= 0) {
        erros.min_base = 'base mínima deve ser um número maior que 0'
      }
    }
    if (Object.keys(erros).length > 0) {
      return e.json(422, { ok: false, erro: 'entrada inválida', campos: erros })
    }

    function aplicar(campo, valor) {
      if (valor === undefined) return
      rec.set(campo, valor === null || valor === '' ? null : valor)
    }
    aplicar('metric', body.metric)
    aplicar('canal', body.canal)
    aplicar('objetivo', body.objetivo)
    aplicar('result_type', body.result_type)
    aplicar('natureza', body.natureza)
    aplicar('direction', body.direction)
    aplicar('period_kind', body.period_kind)
    if (body.threshold_pct !== undefined)
      rec.set('threshold_pct', body.threshold_pct === null ? null : Number(body.threshold_pct))
    if (body.min_base !== undefined)
      rec.set('min_base', body.min_base === null ? null : Number(body.min_base))
    if (body.responsible_user !== undefined)
      rec.set('responsible_user', body.responsible_user || null)

    let hist = []
    try {
      const h = rec.get('history')
      if (h && typeof h === 'string' && h.length > 2) hist = JSON.parse(h)
    } catch (_) {}
    hist.push({
      at: new Date().toISOString(),
      ator: e.auth.id,
      acao: 'editou_rascunho_v' + rec.get('version'),
    })
    rec.set('history', JSON.stringify(hist).slice(0, 1900000))

    $app.save(rec)
    return e.json(200, {
      ok: true,
      id: rec.id,
      version: rec.get('version'),
      state: rec.get('state'),
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/alert-criteria/{id}/approve',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const id = e.request.pathValue('id')
    const col = $app.findCollectionByNameOrId('alert_criteria')
    let rec
    try {
      rec = $app.findRecordById(col, id)
    } catch (_) {
      return e.json(404, { ok: false, erro: 'critério não encontrado' })
    }
    if (String(rec.get('state')) !== 'draft') {
      return e.json(409, {
        ok: false,
        erro: 'estado ' + rec.get('state') + ' não é aprovável — só rascunho',
      })
    }

    // ---- separação de permissões: quem criou não aprova a si mesmo ----
    const criador = rec.get('created_by') || ''
    if (!e.hasSuperuserAuth() && criador && String(criador) === String(e.auth.id)) {
      return e.json(403, {
        ok: false,
        erro: 'quem criou o rascunho não pode aprová-lo — aprovação é de outro responsável',
      })
    }

    // ---- guard de permissão (SPEC-2-005, f9a2a3eb): approve_criteria ----
    const hojeA = new Date().toISOString().slice(0, 10)
    const colG_A = $app.findCollectionByNameOrId('access_grants')
    const meusA = $app.findRecordsByFilter(
      colG_A,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '',
      50,
      0,
    )
    let temApprove = false
    for (const g of meusA) {
      const ateA = String(g.get('valid_until') || '')
      if (ateA !== '' && ateA.slice(0, 10) < hojeA) continue
      let actsA = []
      try {
        const rawA = g.get('actions')
        if (Array.isArray(rawA) && rawA.length > 0 && typeof rawA[0] === 'number') {
          actsA = JSON.parse(String.fromCharCode.apply(null, rawA))
        } else if (typeof rawA === 'string') {
          actsA = JSON.parse(rawA)
        } else {
          actsA = rawA || []
        }
      } catch (eA) {}
      if (actsA.indexOf('approve_criteria') >= 0) temApprove = true
    }
    if (!temApprove && !e.hasSuperuserAuth()) {
      return e.json(403, {
        ok: false,
        erro: 'sem permissão para aprovar critérios (approve_criteria) — fale com o administrador',
      })
    }

    // ---- completude obrigatória (422) ----
    const faltando = []
    function falta(campo, rotulo) {
      const v = rec.get(campo)
      if (v === undefined || v === null || v === '') faltando.push(rotulo)
    }
    falta('metric', 'métrica')
    falta('canal', 'canal')
    falta('objetivo', 'objetivo')
    falta('result_type', 'tipo do resultado')
    falta('natureza', 'natureza')
    falta('direction', 'direção')
    falta('threshold_pct', 'limiar (%)')
    falta('min_base', 'base mínima')
    falta('period_kind', 'calendário do período')
    if (faltando.length > 0) {
      return e.json(422, {
        ok: false,
        erro: 'campos obrigatórios ausentes para aprovar: ' + faltando.join(', '),
      })
    }
    if (Number(rec.get('threshold_pct')) <= 0) {
      return e.json(422, { ok: false, erro: 'limiar deve ser maior que 0' })
    }
    if (Number(rec.get('min_base')) <= 0) {
      return e.json(422, { ok: false, erro: 'base mínima deve ser maior que 0' })
    }

    // ---- aprovação: ator + data + versão gravados; histórico preservado ----
    rec.set('state', 'approved')
    rec.set('approved_by', e.auth.id)
    rec.set('approved_at', new Date().toISOString())
    let hist = []
    try {
      const h = rec.get('history')
      if (h && typeof h === 'string' && h.length > 2) hist = JSON.parse(h)
    } catch (_) {}
    hist.push({
      at: new Date().toISOString(),
      ator: e.auth.id,
      acao: 'aprovou_v' + rec.get('version'),
    })
    rec.set('history', JSON.stringify(hist).slice(0, 1900000))
    $app.save(rec)
    return e.json(200, {
      ok: true,
      id: rec.id,
      uuid: rec.get('uuid'),
      version: rec.get('version'),
      state: rec.get('state'),
      approved_by: e.auth.id,
      approved_at: rec.get('approved_at'),
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/alert-criteria/{id}/archive',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const id = e.request.pathValue('id')
    const col = $app.findCollectionByNameOrId('alert_criteria')
    let rec
    try {
      rec = $app.findRecordById(col, id)
    } catch (_) {
      return e.json(404, { ok: false, erro: 'critério não encontrado' })
    }
    const estadoAtual = String(rec.get('state'))
    if (estadoAtual === 'archived') {
      return e.json(409, { ok: false, erro: 'critério já está arquivado' })
    }
    rec.set('state', 'archived')
    let hist = []
    try {
      const h = rec.get('history')
      if (h && typeof h === 'string' && h.length > 2) hist = JSON.parse(h)
    } catch (_) {}
    hist.push({
      at: new Date().toISOString(),
      ator: e.auth.id,
      acao: 'arquivou_v' + rec.get('version'),
    })
    rec.set('history', JSON.stringify(hist).slice(0, 1900000))
    $app.save(rec)
    return e.json(200, { ok: true, id: rec.id, state: rec.get('state') })
  },
  $apis.requireAuth(),
)
