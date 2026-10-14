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
 * Regras da SPEC:
 * - Aprovação/ator/escopo NUNCA confiados do corpo — approved_by = e.auth.id sempre.
 * - Grant expirado (valid_until < hoje) ou revogado (revoked_at) vale NADA.
 * - Audit append-only, SEM tokens/senhas.
 * - Nenhum grant real aqui: gate da matriz aprovada (card 5b1de184).
 * - JSVM: lógica INLINE nos callbacks (sem helper top-level — AP-2026-10-02-1755).
 */

routerAdd(
  'GET',
  '/backend/v1/acessos/me',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const grants = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '',
      50,
      0,
    )
    const validos = []
    const actions = {}
    for (const g of grants) {
      const ate = String(g.get('valid_until') || '')
      // DateTime zerado chega como string vazia — comparar como STRING (AP-2026-10-14-1155)
      if (ate !== '' && ate.slice(0, 10) < hoje) continue
      let acts = []
      try {
        const raw = g.get('actions')
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          // JSVM devolveu os CÓDIGOS de caractere da string JSON (prova /me 14/10)
          acts = JSON.parse(String.fromCharCode.apply(null, raw))
        } else if (typeof raw === 'string') {
          acts = JSON.parse(raw)
        } else {
          acts = raw || []
        }
      } catch (e2) {}
      validos.push({
        id: g.id,
        role: g.get('role'),
        actions: acts,
        valid_from: g.get('valid_from') || null,
        valid_until: ate || null,
        version: g.get('version'),
        note: g.get('note') || null,
      })
      for (const a of acts) actions[a] = true
    }
    return e.json(200, {
      ok: true,
      email: e.auth.email(),
      grants: validos,
      actions: Object.keys(actions).sort(),
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/acessos/grants',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    // manage_access: o ator precisa ter a action em algum grant válido PRÓPRIO
    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '',
      50,
      0,
    )
    let temManage = false
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
      if (acts.indexOf('manage_access') >= 0) temManage = true
    }
    if (!temManage) {
      return e.json(403, {
        ok: false,
        erro: 'sem permissão para gerenciar acessos (manage_access) — fale com o administrador',
      })
    }
    const todos = $app.findRecordsByFilter(colG, '', '-created', 200, 0)
    const lista = []
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
      } catch (e3) {}
      lista.push({
        id: g.id,
        user_id: g.get('user_id'),
        role: g.get('role'),
        actions: acts,
        valid_from: g.get('valid_from') || null,
        valid_until: g.get('valid_until') || null,
        approved_by: g.get('approved_by') || null,
        approved_at: g.get('approved_at') || null,
        revoked_at: g.get('revoked_at') || null,
        version: g.get('version'),
        note: g.get('note') || null,
        created: g.get('created'),
      })
    }
    return e.json(200, { ok: true, itens: lista })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/acessos/grants',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const body = e.requestInfo().body || {}
    // manage_access do ATOR (não confiada do corpo)
    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '',
      50,
      0,
    )
    let temManage = false
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
      if (acts.indexOf('manage_access') >= 0) temManage = true
    }
    if (!temManage && !e.hasSuperuserAuth()) {
      return e.json(403, {
        ok: false,
        erro: 'sem permissão para gerenciar acessos (manage_access) — fale com o administrador',
      })
    }

    // ---- validação de entrada (422) ----
    const erros = {}
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
    ]
    const papel = String(body.role || '').trim()
    if (papel === '') erros.role = 'informe o papel'
    else if (papel.length > 40) erros.role = 'papel muito longo (máx. 40)'
    let alvoUserId = ''
    if (body.user_id) {
      alvoUserId = String(body.user_id)
        .replace(/[^a-zA-Z0-9]/g, '')
        .slice(0, 15)
    } else if (body.user_email) {
      const email = String(body.user_email).trim().toLowerCase().replace(/'/g, '')
      if (email.indexOf('@') < 3) erros.user_email = 'e-mail inválido'
      else {
        try {
          const u = $app.findRecordsByFilter(
            $app.findCollectionByNameOrId('users'),
            "email='" + email + "'",
            '',
            1,
            0,
          )
          if (!u || u.length === 0) erros.user_email = 'usuário não encontrado com este e-mail'
          else alvoUserId = u[0].id
        } catch (e4) {
          erros.user_email = 'não foi possível procurar o usuário'
        }
      }
    } else {
      erros.user_id = 'informe user_id ou user_email'
    }
    let acts = []
    if (!Array.isArray(body.actions) || body.actions.length === 0) {
      erros.actions = 'informe ao menos uma ação'
    } else {
      for (const a of body.actions) {
        if (ACTIONS_VALIDAS.indexOf(String(a)) === -1) {
          erros.actions =
            'ação inválida: ' + String(a).slice(0, 40) + ' — use ' + ACTIONS_VALIDAS.join(', ')
          break
        }
      }
      if (!erros.actions) acts = body.actions.map(String)
    }
    if (body.valid_until !== undefined && body.valid_until !== null && body.valid_until !== '') {
      const v = String(body.valid_until)
      if (!/^\d{4}-\d{2}-\d{2}/.test(v)) erros.valid_until = 'data inválida — use AAAA-MM-DD'
    }
    if (Object.keys(erros).length > 0) {
      return e.json(422, { ok: false, erro: 'entrada inválida', campos: erros })
    }

    // version = max+1 do par usuário+papel
    const existentes = $app.findRecordsByFilter(
      colG,
      "user_id='" + alvoUserId + "' && role='" + papel.replace(/'/g, '') + "'",
      '-version',
      10,
      0,
    )
    let maxV = 0
    for (const g of existentes) {
      const v = Number(g.get('version') || 0)
      if (v > maxV) maxV = v
    }

    const rec = new Record(colG)
    rec.set('user_id', alvoUserId)
    rec.set('role', papel)
    rec.set('actions', JSON.stringify(acts))
    rec.set(
      'scope_accounts',
      JSON.stringify(
        Array.isArray(body.scope_accounts) && body.scope_accounts.length > 0
          ? body.scope_accounts.map(String)
          : ['*'],
      ),
    )
    rec.set(
      'scope_channels',
      JSON.stringify(
        Array.isArray(body.scope_channels) && body.scope_channels.length > 0
          ? body.scope_channels.map(String)
          : ['*'],
      ),
    )
    if (body.valid_from) rec.set('valid_from', String(body.valid_until || '').slice(0, 10) || null)
    if (body.valid_until) rec.set('valid_until', String(body.valid_until).slice(0, 10))
    rec.set('approved_by', e.auth.id) // SEMPRE o ator autenticado — nunca do corpo
    rec.set('approved_at', new Date().toISOString())
    rec.set('version', maxV + 1)
    rec.set('note', String(body.note || '').slice(0, 300))
    try {
      $app.save(rec)
    } catch (e5) {
      const msg = String(e5).slice(0, 200)
      if (msg.indexOf('idx_grant_unica') >= 0 || msg.indexOf('unique') >= 0) {
        return e.json(409, {
          ok: false,
          erro: 'conflito — já existe grant com esta versão para o par usuário+papel',
        })
      }
      return e.json(500, { ok: false, erro: 'não foi possível gravar o grant: ' + msg })
    }

    // audit (append-only, sem segredo)
    const colA = $app.findCollectionByNameOrId('access_audit')
    const a = new Record(colA)
    a.set('at', new Date().toISOString())
    a.set('actor', e.auth.id)
    a.set('acao', 'criou_grant')
    a.set('alvo', alvoUserId + ' → ' + papel + ' v' + (maxV + 1))
    a.set(
      'detalhe',
      JSON.stringify({
        actions: acts,
        valid_until: body.valid_until || null,
        note: String(body.note || '').slice(0, 200),
      }),
    )
    $app.save(a)

    return e.json(200, {
      ok: true,
      id: rec.id,
      user_id: alvoUserId,
      role: papel,
      version: maxV + 1,
      actions: acts,
      approved_by: e.auth.id,
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/acessos/grants/{id}/revoke',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const id = e.request.pathValue('id')
    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '',
      50,
      0,
    )
    let temManage = false
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
      if (acts.indexOf('manage_access') >= 0) temManage = true
    }
    if (!temManage && !e.hasSuperuserAuth()) {
      return e.json(403, {
        ok: false,
        erro: 'sem permissão para gerenciar acessos (manage_access) — fale com o administrador',
      })
    }
    let rec
    try {
      rec = $app.findRecordById(colG, id)
    } catch (_) {
      return e.json(404, { ok: false, erro: 'grant não encontrado' })
    }
    if (String(rec.get('revoked_at') || '') !== '') {
      return e.json(409, { ok: false, erro: 'grant já está revogado' })
    }
    rec.set('revoked_at', new Date().toISOString())
    $app.save(rec)
    const colA = $app.findCollectionByNameOrId('access_audit')
    const a = new Record(colA)
    a.set('at', new Date().toISOString())
    a.set('actor', e.auth.id)
    a.set('acao', 'revogou_grant')
    a.set('alvo', String(rec.get('user_id')) + ' → ' + String(rec.get('role')))
    a.set('detalhe', JSON.stringify({ grant_id: id, version: rec.get('version') }))
    $app.save(a)
    return e.json(200, { ok: true, id: rec.id, revoked_at: rec.get('revoked_at') })
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/metricas',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    // ---- guard read_metrics + escopos do ATOR (inline — JSVM sem helper top-level) ----
    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '',
      50,
      0,
    )
    let temRead = false
    const contas = []
    const canais = []
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
      if (acts.indexOf('read_metrics') < 0) continue
      temRead = true
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
    }
    if (!temRead) {
      return e.json(403, {
        ok: false,
        erro: 'sem permissão para ler métricas (read_metrics) — fale com o administrador',
      })
    }
    const temTudoContas = contas.indexOf('*') >= 0
    const temTudoCanais = canais.indexOf('*') >= 0
    // ---- filtro de escopo aplicado ANTES de agregar (SPEC-2-005) ----
    let filtro = ''
    if (!temTudoContas) {
      const partes = contas.map((c) => "conta_id='" + c.replace(/'/g, '') + "'")
      partes.push("conta_id=''") // sem conta = sem escopo associado → NEGADO (deny por padrão)
      filtro = '(' + partes.join(' || ') + ')'
    }
    if (!temTudoCanais) {
      const partesC = canais.map((c) => "canal='" + c.replace(/'/g, '') + "'")
      const fCanal = '(' + partesC.join(' || ') + ')'
      filtro = filtro ? filtro + ' && ' + fCanal : fCanal
    }
    const registros = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('metricas_diarias'),
      filtro,
      '-data',
      500,
      0,
    )
    const itens = []
    for (const r of registros) {
      itens.push({
        id: r.id,
        origem: r.get('origem'),
        canal: r.get('canal'),
        natureza: r.get('natureza'),
        conta_id: r.get('conta_id') || '',
        conta_nome: r.get('conta_nome') || '',
        campanha_id: r.get('campanha_id'),
        campanha_nome: r.get('campanha_nome'),
        objetivo: r.get('objetivo'),
        objective_raw: r.get('objective_raw') || null,
        result_type: r.get('result_type') || null,
        data: r.get('data'),
        alcance: r.get('alcance'),
        impressoes: r.get('impressoes'),
        cliques: r.get('cliques'),
        gasto: r.get('gasto'),
        resultados: r.get('resultados'),
        cpc: r.get('cpc'),
        cpm: r.get('cpm'),
        ctr: r.get('ctr'),
        updated: r.get('updated'),
      })
    }
    return e.json(200, {
      ok: true,
      escopo: { contas: temTudoContas ? ['*'] : contas, canais: temTudoCanais ? ['*'] : canais },
      total: itens.length,
      itens: itens,
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/acessos/audit',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '',
      50,
      0,
    )
    let temManage = false
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
      if (acts.indexOf('manage_access') >= 0) temManage = true
    }
    if (!temManage && !e.hasSuperuserAuth()) {
      return e.json(403, {
        ok: false,
        erro: 'sem permissão para gerenciar acessos (manage_access) — fale com o administrador',
      })
    }
    const colA = $app.findCollectionByNameOrId('access_audit')
    const itens = $app.findRecordsByFilter(colA, '', '-at', 200, 0)
    const lista = []
    for (const it of itens) {
      lista.push({
        id: it.id,
        at: it.get('at'),
        actor: it.get('actor') || null,
        acao: it.get('acao'),
        alvo: it.get('alvo') || null,
        detalhe: it.get('detalhe') || null,
      })
    }
    return e.json(200, { ok: true, itens: lista })
  },
  $apis.requireAuth(),
)
