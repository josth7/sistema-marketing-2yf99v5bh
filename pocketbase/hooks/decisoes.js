/// <reference path="../pb_data/types.d.ts" />
/**
 * Hooks do servidor — cadastro de decisões (SPEC-2-003, card edd618c7, CA-2-08).
 *
 * Rotas (autenticadas — $apis.requireAuth()):
 *   GET   /backend/v1/decisions       → lista (opcional ?state=)
 *   POST  /backend/v1/decisions       → cria decisão válida (422 inválida; não persiste)
 *   PATCH /backend/v1/decisions/{id}  → edita com expected_revision (409 concorrente)
 *   POST  /backend/v1/decisions/{id}/close → encerra com review_outcome (422 vazio)
 *
 * Regras: criação exige título/justificativa/ação/responsável/review_date
 * (>= amanhã local America/Sao_Paulo); edição de pendente pode manter data
 * vencida mas não cria agendamento passado; fechar exige resultado; histórico
 * append-only com ator/data/before-after. Sem lembrete/inbox aqui (a434ca96).
 *
 * JSVM: TODA a lógica fica INLINE nos callbacks — funções top-level não são
 * visíveis dentro dos callbacks (pool de VM separado do PocketBase).
 */
routerAdd(
  'GET',
  '/backend/v1/decisions',
  (e) => {
    const col = $app.findCollectionByNameOrId('decisions')
    const qState = e.request.url.query().get('state') || ''
    let filtro = ''
    if (qState) filtro = "state='" + qState.replace(/'/g, '') + "'"
    const registros = $app.findRecordsByFilter(col, filtro, '-created', 200, 0)
    const itens = []
    for (const r of registros) {
      itens.push({
        id: r.id,
        uuid: r.get('uuid'),
        source_alert_id: r.get('source_alert_id') || null,
        scope: r.get('scope') || null,
        title: r.get('title'),
        justification: r.get('justification'),
        planned_action: r.get('planned_action'),
        responsible_user: r.get('responsible_user'),
        review_date: r.get('review_date'),
        state: r.get('state'),
        revision: r.get('revision'),
        created_by: r.get('created_by'),
        created_at: r.get('created_at'),
        updated_at: r.get('updated_at'),
        review_outcome: r.get('review_outcome') || null,
        closed_at: r.get('closed_at') || null,
        history: r.get('history') || null,
      })
    }
    return e.json(200, { ok: true, itens: itens })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/decisions',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const body = e.requestInfo().body || {}
    const col = $app.findCollectionByNameOrId('decisions')

    // ---- helpers inline (JSVM) ----
    function textoValido(v, max) {
      return typeof v === 'string' && v.trim().length > 0 && v.length <= max
    }
    // São Paulo = UTC-3 fixo (sem horário de verão): data local = data(now - 3h);
    // amanhã local = data(now + 21h). Intl NÃO existe no JSVM do PocketBase.
    function amanhaISO() {
      return new Date(Date.now() + 21 * 60 * 60 * 1000).toISOString().slice(0, 10)
    }
    function uuidV4() {
      const hex = '0123456789abcdef'
      let u = ''
      for (let i = 0; i < 36; i++) {
        if (i === 8 || i === 13 || i === 18 || i === 23) u += '-'
        else if (i === 14) u += '4'
        else if (i === 19) u += hex[8 + Math.floor(Math.random() * 4)]
        else u += hex[Math.floor(Math.random() * 16)]
      }
      return u
    }

    // ---- obrigatórios (CA-2-08): 422 e NÃO persiste ----
    const erros = {}
    if (!textoValido(body.title, 200)) erros.title = 'título é obrigatório (até 200 caracteres)'
    if (!textoValido(body.justification, 4000))
      erros.justification = 'justificativa é obrigatória (até 4000 caracteres)'
    if (!textoValido(body.planned_action, 4000))
      erros.planned_action = 'ação planejada é obrigatória (até 4000 caracteres)'
    if (!textoValido(body.responsible_user, 200))
      erros.responsible_user = 'responsável é obrigatório — digite o E-MAIL do usuário'    if (
      !textoValido(body.review_date, 10) ||
      !/^\d{4}-\d{2}-\d{2}$/.test(String(body.review_date || ''))
    ) {
      erros.review_date = 'data de revisão é obrigatória (formato AAAA-MM-DD)'
    } else if (String(body.review_date) < amanhaISO()) {
      erros.review_date = 'data de revisão deve ser de amanhã em diante (não pode ser passada)'
    }
    if (body.scope !== undefined && body.scope !== null && String(body.scope).length > 60)
      erros.scope = 'escopo tem até 60 caracteres'
    if (Object.keys(erros).length > 0) {
      return e.json(422, { ok: false, erro: 'entrada inválida', campos: erros })
    }

    // ---- responsável deve existir (usuário ativo): aceita ID ou E-MAIL ----
    let respId = null
    try {
      respId = $app.findRecordById('_pb_users_auth_', body.responsible_user).id
    } catch (_) {
      try {
        respId = $app.findAuthRecordByEmail('_pb_users_auth_', String(body.responsible_user)).id
      } catch (_) {}
    }
    if (!respId) {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: {
          responsible_user:
            'responsável não encontrado — digite o E-MAIL do usuário (ex.: anezia@haisan.com.br) ou o ID dele',
        },
      })
    }
    // ---- referência de alerta no mesmo escopo (quando informada) ----
    if (body.source_alert_id) {
      let alerta = null
      try {
        alerta = $app.findRecordById('alert_criteria', body.source_alert_id)
      } catch (_) {
        return e.json(422, {
          ok: false,
          erro: 'entrada inválida',
          campos: { source_alert_id: 'alerta de referência não encontrado' },
        })
      }
      if (body.scope && String(alerta.get('canal') || '') !== String(body.scope)) {
        return e.json(403, {
          ok: false,
          erro: 'alerta de referência está fora do escopo da decisão',
        })
      }
    }

    const rec = new Record(col)
    rec.set('uuid', uuidV4())
    rec.set('title', body.title)
    rec.set('justification', body.justification)
    rec.set('planned_action', body.planned_action)
    rec.set('responsible_user', respId)
    rec.set('review_date', body.review_date)
    rec.set('state', 'open')
    rec.set('revision', 1)
    rec.set('created_by', e.auth.id)
    rec.set('created_at', new Date().toISOString())
    rec.set('updated_at', new Date().toISOString())
    if (body.scope) rec.set('scope', body.scope)
    if (body.source_alert_id) rec.set('source_alert_id', body.source_alert_id)
    rec.set(
      'history',
      JSON.stringify([{ at: new Date().toISOString(), ator: e.auth.id, acao: 'criou_decisao' }]),
    )
    $app.save(rec)
    return e.json(200, { ok: true, id: rec.id, uuid: rec.get('uuid'), revision: 1, state: 'open' })
  },
  $apis.requireAuth(),
)

routerAdd(
  'PATCH',
  '/backend/v1/decisions/{id}',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const id = e.request.pathValue('id')
    const body = e.requestInfo().body || {}
    const col = $app.findCollectionByNameOrId('decisions')

    function textoValido(v, max) {
      return typeof v === 'string' && v.trim().length > 0 && v.length <= max
    }
    // São Paulo = UTC-3 fixo (sem horário de verão): amanhã local = data(now + 21h).
    function amanhaISO() {
      return new Date(Date.now() + 21 * 60 * 60 * 1000).toISOString().slice(0, 10)
    }
    function parseHistorico(rec) {
      try {
        const h = rec.get('history')
        if (h && typeof h === 'string' && h.length > 2) return JSON.parse(h)
      } catch (_) {}
      return []
    }

    let rec
    try {
      rec = $app.findRecordById(col, id)
    } catch (_) {
      return e.json(404, { ok: false, erro: 'decisão não encontrada' })
    }
    if (String(rec.get('state')) === 'closed') {
      return e.json(409, { ok: false, erro: 'decisão encerrada não é editável' })
    }
    if (body.expected_revision === undefined) {
      return e.json(409, { ok: false, erro: 'envie expected_revision com a versão que você leu' })
    }
    if (Number(body.expected_revision) !== Number(rec.get('revision'))) {
      return e.json(409, {
        ok: false,
        erro: 'conflito de revisão — alguém editou antes de você (recarregue)',
      })
    }

    // ---- campos presentes validados; novo agendamento não pode ser passado ----
    const erros = {}
    if (body.title !== undefined && !textoValido(body.title, 200))
      erros.title = 'título inválido (1 a 200 caracteres)'
    if (body.justification !== undefined && !textoValido(body.justification, 4000))
      erros.justification = 'justificativa inválida (1 a 4000 caracteres)'
    if (body.planned_action !== undefined && !textoValido(body.planned_action, 4000))
      erros.planned_action = 'ação planejada inválida (1 a 4000 caracteres)'
    if (body.responsible_user !== undefined) {
      if (!textoValido(body.responsible_user, 200)) {
        erros.responsible_user = 'responsável inválido'
      } else {
        let okResp = false
        try {
          $app.findRecordById('_pb_users_auth_', body.responsible_user)
          okResp = true
        } catch (_) {
          try {
            $app.findAuthRecordByEmail('_pb_users_auth_', String(body.responsible_user))
            okResp = true
          } catch (_) {}
        }
        if (!okResp)
          erros.responsible_user = 'responsável não encontrado — use o E-MAIL do usuário ou o ID'
      }
    }
    if (body.review_date !== undefined && body.review_date !== null) {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(String(body.review_date))) {
        erros.review_date = 'data de revisão inválida (formato AAAA-MM-DD)'
      } else if (String(body.review_date) < amanhaISO()) {
        erros.review_date = 'novo agendamento não pode ficar no passado'
      }
    }
    if (body.scope !== undefined && body.scope !== null && String(body.scope).length > 60)
      erros.scope = 'escopo tem até 60 caracteres'
    if (Object.keys(erros).length > 0) {
      return e.json(422, { ok: false, erro: 'entrada inválida', campos: erros })
    }

    // ---- histórico com before/after dos campos permitidos ----
    const camposPermitidos = [
      'title',
      'justification',
      'planned_action',
      'responsible_user',
      'review_date',
      'state',
    ]
    const antes = {}
    const depois = {}
    let mudou = false
    for (const c of camposPermitidos) {
      if (body[c] !== undefined) {
        const valorAtual = rec.get(c)
        let valorNovo = body[c]
        if (c === 'responsible_user') {
          let respId = null
          try {
            respId = $app.findRecordById('_pb_users_auth_', String(valorNovo)).id
          } catch (_) {
            try {
              respId = $app.findAuthRecordByEmail('_pb_users_auth_', String(valorNovo)).id
            } catch (_) {}
          }
          if (!respId) {
            return e.json(422, {
              ok: false,
              erro: 'entrada inválida',
              campos: {
                responsible_user: 'responsável não encontrado — use o E-MAIL do usuário ou o ID',
              },
            })
          }
          valorNovo = respId
        }
        if (String(valorAtual ?? '') !== String(valorNovo ?? '')) {
          antes[c] = valorAtual ?? null
          depois[c] = valorNovo
          rec.set(c, valorNovo)
          mudou = true
        }
      }
    }
    if (mudou) {
      const hist = parseHistorico(rec)
      hist.push({
        at: new Date().toISOString(),
        ator: e.auth.id,
        acao: 'editou_decisao',
        antes: antes,
        depois: depois,
      })
      rec.set('history', JSON.stringify(hist))
    }
    rec.set('revision', Number(rec.get('revision')) + 1)
    rec.set('updated_at', new Date().toISOString())
    $app.save(rec)
    return e.json(200, {
      ok: true,
      id: rec.id,
      revision: rec.get('revision'),
      state: rec.get('state'),
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/decisions/{id}/close',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const id = e.request.pathValue('id')
    const body = e.requestInfo().body || {}
    const col = $app.findCollectionByNameOrId('decisions')

    function textoValido(v, max) {
      return typeof v === 'string' && v.trim().length > 0 && v.length <= max
    }
    function parseHistorico(rec) {
      try {
        const h = rec.get('history')
        if (h && typeof h === 'string' && h.length > 2) return JSON.parse(h)
      } catch (_) {}
      return []
    }

    let rec
    try {
      rec = $app.findRecordById(col, id)
    } catch (_) {
      return e.json(404, { ok: false, erro: 'decisão não encontrada' })
    }
    if (String(rec.get('state')) === 'closed') {
      return e.json(409, { ok: false, erro: 'decisão já está encerrada' })
    }
    if (!textoValido(body.review_outcome, 4000)) {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { review_outcome: 'resultado da revisão é obrigatório para encerrar' },
      })
    }
    const antes = { state: rec.get('state'), review_outcome: null }
    rec.set('state', 'closed')
    rec.set('review_outcome', body.review_outcome)
    rec.set('closed_at', new Date().toISOString())
    rec.set('updated_at', new Date().toISOString())
    const hist = parseHistorico(rec)
    hist.push({
      at: new Date().toISOString(),
      ator: e.auth.id,
      acao: 'encerrou_decisao',
      antes: antes,
      depois: { state: 'closed', review_outcome: body.review_outcome },
    })
    rec.set('history', JSON.stringify(hist))
    $app.save(rec)
    return e.json(200, {
      ok: true,
      id: rec.id,
      state: rec.get('state'),
      closed_at: rec.get('closed_at'),
    })
  },
  $apis.requireAuth(),
)
