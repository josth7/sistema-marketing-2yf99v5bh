/// <reference path="../pb_data/types.d.ts" />
/**
 * Hooks do servidor — acessos e permissões (SPEC-2-005, card f9a2a3eb, CA-2-12).
 *
 * Rotas (todas autenticadas — $apis.requireAuth()):
 *   GET  /backend/v1/acessos/me                    → minhas permissões válidas
 *   GET  /backend/v1/acessos/grants                → lista grants (só manage_access)
 *   POST /backend/v1/acessos/grants                → cria grant (só manage_access)
 *   POST /backend/v1/acessos/grants/{id}/revoke    → revoga (só manage_access)
 *   GET  /backend/v1/acessos/audit                 → trilha (só manage_access)
 *
 * Catálogo de ações (ACTIONS_VALIDAS) é a ÚNICA fonte do que pode existir num
 * grant. Papéis: direction / management / marketing / agency.
 * Escopos: scope_accounts e scope_channels (listas; '*' = tudo; vazio = negado
 * para ações que exigem escopo — deny por padrão, SPEC-2-005).
 * Ações da fase 3 (card 2e44a45f): request_analysis, read_analyses,
 * review_ai_summary — acrescentadas APENAS aqui, nada mais neste arquivo.
 *
 * JSVM: toda lógica inline nos callbacks; json pode voltar como array de
 * char-codes (parser tolerante); DateTime zerado chega como string vazia.
 */

// ==================== GET /backend/v1/acessos/me ====================
routerAdd(
  'GET',
  '/backend/v1/acessos/me',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const app = $app
    const hoje = new Date().toISOString().slice(0, 10)
    const colG = app.findCollectionByNameOrId('access_grants')
    const meus = app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      50,
      0,
    )
    const itens = []
    const contas = []
    const canais = []
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
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
      let sa = []
      let sc = []
      try {
        const ra = g.get('scope_accounts')
        sa =
          Array.isArray(ra) && ra.length > 0 && typeof ra[0] === 'number'
            ? JSON.parse(String.fromCharCode.apply(null, ra))
            : typeof ra === 'string'
              ? JSON.parse(ra)
              : ra || []
      } catch (e3) {}
      try {
        const rc = g.get('scope_channels')
        sc =
          Array.isArray(rc) && rc.length > 0 && typeof rc[0] === 'number'
            ? JSON.parse(String.fromCharCode.apply(null, rc))
            : typeof rc === 'string'
              ? JSON.parse(rc)
              : rc || []
      } catch (e4) {}
      for (const c of sa) if (contas.indexOf(String(c)) < 0) contas.push(String(c))
      for (const c of sc) if (canais.indexOf(String(c)) < 0) canais.push(String(c))
      itens.push({
        id: g.id,
        role: g.get('role'),
        actions: acts,
        scope_accounts: sa,
        scope_channels: sc,
        valid_from: de,
        valid_until: ate,
        version: g.get('version'),
        note: g.get('note'),
      })
    }
    return e.json(200, {
      ok: true,
      v: 'me-v2',
      user: { id: e.auth.id, email: e.auth.email },
      grants: itens,
      escopo: { contas: contas, canais: canais },
    })
  },
  $apis.requireAuth(),
)

// ==================== GET /backend/v1/acessos/grants (só manage_access) ====================
routerAdd(
  'GET',
  '/backend/v1/acessos/grants',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const app = $app
    // guard manage_access (inline)
    const colG = app.findCollectionByNameOrId('access_grants')
    const meus = app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '',
      50,
      0,
    )
    let podeGerir = false
    for (const g of meus) {
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
      if (acts.indexOf('manage_access') >= 0) {
        podeGerir = true
        break
      }
    }
    if (!podeGerir) {
      return e.json(403, {
        ok: false,
        erro: 'sem permissão para gerir acessos (manage_access) — fale com o administrador',
      })
    }
    const todos = app.findRecordsByFilter(colG, '', '-created', 200, 0)
    const itens = []
    for (const g of todos) {
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
      let emailAlvo = ''
      try {
        const u = app.findRecordById('users', g.get('user_id'))
        emailAlvo = String(u.get('email') || '')
      } catch (e3) {}
      let emailAprov = ''
      try {
        const a = app.findRecordById('users', g.get('approved_by'))
        emailAprov = String(a.get('email') || '')
      } catch (e4) {}
      itens.push({
        id: g.id,
        user_id: g.get('user_id'),
        user_email: emailAlvo,
        role: g.get('role'),
        actions: acts,
        scope_accounts: g.get('scope_accounts'),
        scope_channels: g.get('scope_channels'),
        valid_from: g.get('valid_from'),
        valid_until: g.get('valid_until'),
        approved_by: g.get('approved_by'),
        approved_by_email: emailAprov,
        approved_at: g.get('approved_at'),
        revoked_at: g.get('revoked_at'),
        version: g.get('version'),
        note: g.get('note'),
        created: g.get('created'),
      })
    }
    return e.json(200, { ok: true, itens: itens })
  },
  $apis.requireAuth(),
)

// ==================== POST /backend/v1/acessos/grants (só manage_access) ====================
routerAdd(
  'POST',
  '/backend/v1/acessos/grants',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const app = $app
    // guard manage_access (inline)
    const colG = app.findCollectionByNameOrId('access_grants')
    const meus = app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '',
      50,
      0,
    )
    let podeGerir = false
    for (const g of meus) {
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
      if (acts.indexOf('manage_access') >= 0) {
        podeGerir = true
        break
      }
    }
    if (!podeGerir) {
      return e.json(403, {
        ok: false,
        erro: 'sem permissão para gerir acessos (manage_access) — fale com o administrador',
      })
    }
    const body = e.requestInfo().body || {}
    const ACTIONS_VALIDAS = [
      'read_metrics',
      'manage_criteria',
      'read_alerts',
      'manage_alerts',
      'read_decisions',
      'manage_decisions',
      'read_reports',
      'approve_criteria',
      'approve_reports',
      'manage_access',
      'request_analysis',
      'read_analyses',
      'review_ai_summary',

      'read_conversas',
      // CA-3-50 (06/11): responder pelo sistema é ação SEPARADA de ler.
      // A gestão libera pessoa por pessoa na tela Administração.
      'reply_conversas',
      'manage_whatsapp',
      'manage_atendimento',
    ]
    const papel = String(body.role || '').trim()
    if (papel === '')
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { role: 'informe o papel' },
      })
    if (papel.length > 40)
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { role: 'papel muito longo (máx. 40)' },
      })
    let alvoUserId = ''
    if (body.user_id) {
      alvoUserId = String(body.user_id)
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 15)
    } else if (body.user_email) {
      const email = String(body.user_email).trim().toLowerCase().replace(/'/g, '')
      if (email.indexOf('@') < 3)
        return e.json(422, {
          ok: false,
          erro: 'entrada inválida',
          campos: { user_email: 'e-mail inválido' },
        })
      try {
        const u = app.findRecordsByFilter(
          app.findCollectionByNameOrId('users'),
          "email='" + email + "'",
          '',
          1,
          0,
        )
        if (!u || u.length === 0)
          return e.json(404, { ok: false, erro: 'usuário não encontrado para ' + email })
        alvoUserId = u[0].id
      } catch (e5) {
        return e.json(404, { ok: false, erro: 'usuário não encontrado para ' + email })
      }
    } else {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { user_id: 'informe user_id ou user_email' },
      })
    }
    // ações
    let acoes = body.actions
    if (typeof acoes === 'string') {
      try {
        acoes = JSON.parse(acoes)
      } catch (e6) {
        acoes = null
      }
    }
    if (!Array.isArray(acoes) || acoes.length === 0)
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { actions: 'lista obrigatória' },
      })
    const acoesLimpos = []
    for (const a of acoes) {
      const s = String(a).trim()
      if (ACTIONS_VALIDAS.indexOf(s) < 0)
        return e.json(422, {
          ok: false,
          erro: 'entrada inválida',
          campos: { actions: 'ação desconhecida: ' + s },
        })
      if (acoesLimpos.indexOf(s) < 0) acoesLimpos.push(s)
    }
    // escopos
    const parseLista = function (v) {
      if (typeof v === 'string') {
        try {
          const p = JSON.parse(v)
          return Array.isArray(p) ? p : []
        } catch (e7) {
          return []
        }
      }
      return Array.isArray(v) ? v : []
    }
    const sa = parseLista(body.scope_accounts)
    const sc = parseLista(body.scope_channels)
    for (const s of sa.concat(sc)) {
      if (String(s).length > 64)
        return e.json(422, {
          ok: false,
          erro: 'entrada inválida',
          campos: { scope: 'valor muito longo (máx. 64)' },
        })
    }
    // validade
    const de = String(body.valid_from || '').slice(0, 10)
    const ate = String(body.valid_until || '').slice(0, 10)
    if (de !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(de))
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { valid_from: 'use AAAA-MM-DD' },
      })
    if (ate !== '' && !/^\d{4}-\d{2}-\d{2}$/.test(ate))
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { valid_until: 'use AAAA-MM-DD' },
      })
    if (de !== '' && ate !== '' && de > ate)
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { valid_until: 'anterior ao início' },
      })
    // auto-aprovação proibida (matriz de aprovação — SPEC-2-005)
    if (alvoUserId === e.auth.id)
      return e.json(403, {
        ok: false,
        erro: 'não é possível criar grant para si mesmo (matriz de aprovação)',
      })
    const agoraISO = new Date().toISOString()
    const g = new Record(colG)
    g.set('user_id', alvoUserId)
    g.set('role', papel)
    g.set('actions', JSON.stringify(acoesLimpos))
    g.set('scope_accounts', JSON.stringify(sa))
    g.set('scope_channels', JSON.stringify(sc))
    g.set('valid_from', de)
    g.set('valid_until', ate)
    g.set('approved_by', e.auth.id)
    g.set('approved_at', agoraISO)
    g.set('version', 1)
    g.set('note', String(body.note || '').slice(0, 200))
    app.save(g)
    // trilha append-only
    try {
      const colA = app.findCollectionByNameOrId('access_audit')
      const a = new Record(colA)
      a.set('actor_id', e.auth.id)
      a.set('acao', 'grant_criado')
      a.set('alvo_grant_id', g.id)
      a.set('alvo_user_id', alvoUserId)
      a.set('detalhe', JSON.stringify({ acoes: acoesLimpos, papel: papel }))
      a.set('created_at', agoraISO)
      app.save(a)
    } catch (e8) {}
    return e.json(201, { ok: true, grant_id: g.id })
  },
  $apis.requireAuth(),
)

// ==================== POST /backend/v1/acessos/grants/{id}/revoke (só manage_access) ====================
routerAdd(
  'POST',
  '/backend/v1/acessos/grants/{id}/revoke',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const app = $app
    const colG = app.findCollectionByNameOrId('access_grants')
    const meus = app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '',
      50,
      0,
    )
    let podeGerir = false
    for (const g of meus) {
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
      if (acts.indexOf('manage_access') >= 0) {
        podeGerir = true
        break
      }
    }
    if (!podeGerir) {
      return e.json(403, {
        ok: false,
        erro: 'sem permissão para gerir acessos (manage_access) — fale com o administrador',
      })
    }
    let g
    try {
      g = app.findRecordById('access_grants', e.request.pathValue('id'))
    } catch (_) {
      return e.json(404, { ok: false, erro: 'grant não encontrado' })
    }
    if (String(g.get('revoked_at') || '') !== '') {
      return e.json(200, { ok: true, replay: true, grant_id: g.id })
    }
    const agoraISO = new Date().toISOString()
    g.set('revoked_at', agoraISO)
    app.save(g)
    try {
      const colA = app.findCollectionByNameOrId('access_audit')
      const a = new Record(colA)
      a.set('actor_id', e.auth.id)
      a.set('acao', 'grant_revogado')
      a.set('alvo_grant_id', g.id)
      a.set('alvo_user_id', g.get('user_id'))
      a.set('detalhe', '{}')
      a.set('created_at', agoraISO)
      app.save(a)
    } catch (e3) {}
    return e.json(200, { ok: true, grant_id: g.id, revogado_em: agoraISO })
  },
  $apis.requireAuth(),
)

// ==================== GET /backend/v1/acessos/audit (só manage_access) ====================
routerAdd(
  'GET',
  '/backend/v1/acessos/audit',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const app = $app
    const colG = app.findCollectionByNameOrId('access_grants')
    const meus = app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '',
      50,
      0,
    )
    let podeGerir = false
    for (const g of meus) {
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
      if (acts.indexOf('manage_access') >= 0) {
        podeGerir = true
        break
      }
    }
    if (!podeGerir) {
      return e.json(403, {
        ok: false,
        erro: 'sem permissão para gerir acessos (manage_access) — fale com o administrador',
      })
    }
    const colA = app.findCollectionByNameOrId('access_audit')
    const registros = app.findRecordsByFilter(colA, '', '-created', 200, 0)
    const itens = []
    for (const a of registros) {
      itens.push({
        id: a.id,
        actor_id: a.get('actor_id'),
        acao: a.get('acao'),
        alvo_grant_id: a.get('alvo_grant_id'),
        alvo_user_id: a.get('alvo_user_id'),
        detalhe: a.get('detalhe'),
        created_at: a.get('created_at'),
      })
    }
    return e.json(200, { ok: true, itens: itens })
  },
  $apis.requireAuth(),
)
