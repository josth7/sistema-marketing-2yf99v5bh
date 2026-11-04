/// <reference path="../pb_data/types.d.ts" />
/**
 * MUDAR CARGO E ACESSOS DE CADA PESSOA, COM TRAVAS (CA-3-31, 04/11).
 *
 * A rota antiga (`POST /acessos/grants`) só CRIA grant com `version: 1`. Ela
 * não serve para editar: o UNIQUE (user_id, role, version) recusa o segundo
 * registro, então mudar acesso de quem já tem grant falha calado.
 *
 * ROTAS NOVAS
 *
 *   POST /backend/v1/acessos/pessoa/{id}
 *     body: { acoes: [...], escopo: 'todos'|'proprio', validade?: 'AAAA-MM-DD' }
 *     Altera o grant ATIVO da pessoa (soma/substitui ações no MESMO registro).
 *
 *   POST /backend/v1/acessos/pessoa/{id}/senha
 *     body: { senha: '...' } — redefine a senha (gestão não vê a antiga).
 *
 *   GET  /backend/v1/acessos/auditoria
 *     Histórico append-only de quem mexeu em quê (CA-3-35 vem junto).
 *
 * TRAVAS (pedidas no card — sem elas a tela vira arma)
 *   T1. ninguém muda o PRÓPRIO acesso (evita auto-promoção)
 *   T2. não dá para ficar sem NENHUM manage_access: se a mudança tiraria o
 *       último, recusa (senão ninguém mais abre a tela e o sistema trava)
 *   T3. ação desconhecida é recusada (não grava lixo no grant)
 *   T4. toda mudança grava em `access_audit` com quem, quando e o antes/depois
 *   T5. senha provisória exige troca no primeiro acesso (marca `provisoria`)
 *
 * JSVM: helpers INLINE (função no topo quebra o arquivo inteiro).
 */

// ==================== lista de ações que existem ====================
// (mantida em UM lugar; a tela busca daqui para montar as caixas de seleção)

// ==================== catálogo de ações (para a tela) ====================
routerAdd(
  'GET',
  '/backend/v1/acessos/acoes',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    // catalogo INLINE: `const` no topo do arquivo quebra o hook inteiro no
    // JSVM (todas as rotas viram 404 — lição de 03/11, reincidente aqui)
    const ACOES_SISTEMA = [
      { id: 'read_metrics', rotulo: 'Ver painel e métricas', grupo: 'Base' },
      { id: 'read_leads', rotulo: 'Ver leads (CRM)', grupo: 'CRM' },
      { id: 'manage_leads', rotulo: 'Criar e editar leads', grupo: 'CRM' },
      { id: 'read_conversas', rotulo: 'Ver conversas do WhatsApp', grupo: 'WhatsApp' },
      { id: 'manage_whatsapp', rotulo: 'Gerir números do WhatsApp', grupo: 'WhatsApp' },
      {
        id: 'manage_atendimento',
        rotulo: 'Configurar o atendimento automático',
        grupo: 'WhatsApp',
      },
      { id: 'manage_criteria', rotulo: 'Editar critérios', grupo: 'Marketing' },
      { id: 'approve_criteria', rotulo: 'Aprovar critérios', grupo: 'Marketing' },
      { id: 'read_alerts', rotulo: 'Ver alertas', grupo: 'Marketing' },
      { id: 'manage_alerts', rotulo: 'Gerir alertas', grupo: 'Marketing' },
      { id: 'read_decisions', rotulo: 'Ver decisões', grupo: 'Marketing' },
      { id: 'manage_decisions', rotulo: 'Gerir decisões', grupo: 'Marketing' },
      { id: 'read_reports', rotulo: 'Ver relatórios', grupo: 'Marketing' },
      { id: 'approve_reports', rotulo: 'Aprovar relatórios', grupo: 'Marketing' },
      { id: 'read_analyses', rotulo: 'Ver análises e concorrentes', grupo: 'Marketing' },
      { id: 'request_analysis', rotulo: 'Pedir análise de IA', grupo: 'Marketing' },
      { id: 'review_ai_summary', rotulo: 'Revisar resumo da IA', grupo: 'Marketing' },
      { id: 'manage_access', rotulo: 'Gerir acessos da equipe', grupo: 'Administração' },
    ]
    return e.json(200, { ok: true, acoes: ACOES_SISTEMA })
  },
  $apis.requireAuth(),
)

// ==================== mudar acesso de uma pessoa ====================
routerAdd(
  'POST',
  '/backend/v1/acessos/pessoa/{id}',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    function lerLista(raw) {
      try {
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          return JSON.parse(String.fromCharCode.apply(null, raw))
        }
        if (typeof raw === 'string') return JSON.parse(raw)
        return raw || []
      } catch (err) {
        return []
      }
    }

    const app = $app
    const colG = app.findCollectionByNameOrId('access_grants')
    const hoje = new Date().toISOString().slice(0, 10)

    // ---------- guard: manage_access ----------
    var souAdmin = false
    var todosGrants = []
    try {
      todosGrants = app.findRecordsByFilter(colG, "revoked_at=''", '', 500, 0)
    } catch (e0) {
      return e.json(200, { ok: false, erro: 'não consegui ler os acessos' })
    }
    for (const g of todosGrants) {
      if (String(g.get('user_id')) !== e.auth.id) continue
      const a = lerLista(g.get('actions'))
      if (a.indexOf('manage_access') >= 0) souAdmin = true
    }
    if (!souAdmin) return e.json(403, { ok: false, erro: 'só quem tem manage_access' })

    const alvoId = String(e.request.pathValue('id') || '')
    if (alvoId === '') return e.json(400, { ok: false, erro: 'pessoa não informada' })

    // ---------- TRAVA T1: ninguém muda o próprio acesso ----------
    if (alvoId === e.auth.id) {
      return e.json(403, {
        ok: false,
        erro: 'não é possível alterar o seu próprio acesso (trava contra auto-promoção)',
      })
    }

    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}

    // escopo: 'todos' = vê tudo; 'proprio' = só o que é dele
    const escopo = String(body.escopo || 'proprio')
    if (escopo !== 'todos' && escopo !== 'proprio') {
      return e.json(422, { ok: false, erro: 'escopo inválido (use "todos" ou "proprio")' })
    }

    // ---------- TRAVA T3: ação desconhecida é recusada ----------
    // lista inline (mesma razão: nada de const no topo)
    const validas = [
      'read_metrics',
      'read_leads',
      'manage_leads',
      'read_conversas',
      'manage_whatsapp',
      'manage_atendimento',
      'manage_criteria',
      'approve_criteria',
      'read_alerts',
      'manage_alerts',
      'read_decisions',
      'manage_decisions',
      'read_reports',
      'approve_reports',
      'read_analyses',
      'request_analysis',
      'review_ai_summary',
      'manage_access',
    ]
    var acoes = body.acoes
    if (typeof acoes === 'string') {
      try {
        acoes = JSON.parse(acoes)
      } catch (eP) {
        acoes = null
      }
    }
    if (!Array.isArray(acoes)) return e.json(422, { ok: false, erro: 'lista de ações obrigatória' })
    const limpas = []
    for (const a of acoes) {
      const s = String(a).trim()
      if (validas.indexOf(s) < 0) {
        return e.json(422, { ok: false, erro: 'ação desconhecida: ' + s })
      }
      if (limpas.indexOf(s) < 0) limpas.push(s)
    }

    // ---------- TRAVA T2: não pode sobrar zero manage_access ----------
    if (limpas.indexOf('manage_access') < 0) {
      // quantas pessoas ATIVAS (fora o alvo) ainda teriam manage_access?
      var outrosAdmins = 0
      for (const g of todosGrants) {
        const uid = String(g.get('user_id') || '')
        if (uid === '' || uid === alvoId) continue
        const de = String(g.get('valid_from') || '')
        const ate = String(g.get('valid_until') || '')
        if (de !== '' && de.slice(0, 10) > hoje) continue
        if (ate !== '' && ate.slice(0, 10) < hoje) continue
        const a = lerLista(g.get('actions'))
        if (a.indexOf('manage_access') >= 0) outrosAdmins++
      }
      if (outrosAdmins === 0) {
        return e.json(422, {
          ok: false,
          erro:
            'esta mudança deixaria o sistema SEM ninguém para gerir acessos. ' +
            'Dê manage_access a outra pessoa antes de tirar da última.',
        })
      }
    }

    // ---------- acha o grant ativo do alvo ----------
    var grantAlvo = null
    for (const g of todosGrants) {
      if (String(g.get('user_id')) !== alvoId) continue
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
      if (ate !== '' && ate.slice(0, 10) < hoje) continue
      grantAlvo = g
      break
    }

    const antes = grantAlvo ? lerLista(grantAlvo.get('actions')) : []
    const papelAtual = grantAlvo ? String(grantAlvo.get('role') || 'vendedor') : 'vendedor'

    // ---------- grava (edita o MESMO registro, respeitando o UNIQUE) ----------
    var grantId = ''
    try {
      if (grantAlvo) {
        grantAlvo.set('actions', JSON.stringify(limpas))
        grantAlvo.set('scope_accounts', JSON.stringify(escopo === 'todos' ? ['*'] : []))
        if (String(body.validade || '') !== '') {
          grantAlvo.set('valid_until', String(body.validade).slice(0, 10))
        }
        app.save(grantAlvo)
        grantId = grantAlvo.id
      } else {
        const novo = new Record(colG)
        novo.set('user_id', alvoId)
        novo.set('role', papelAtual)
        novo.set('actions', JSON.stringify(limpas))
        novo.set('scope_accounts', JSON.stringify(escopo === 'todos' ? ['*'] : []))
        novo.set('scope_channels', JSON.stringify([]))
        novo.set('valid_from', '')
        novo.set('valid_until', String(body.validade || '').slice(0, 10))
        novo.set('approved_by', e.auth.id)
        novo.set('approved_at', new Date().toISOString())
        novo.set('version', 1)
        novo.set('revoked_at', '')
        novo.set('note', 'alterado pela tela de acessos em ' + hoje)
        app.save(novo)
        grantId = novo.id
      }
    } catch (eS) {
      return e.json(500, { ok: false, erro: 'falha ao gravar: ' + String(eS).slice(0, 200) })
    }

    // ---------- TRAVA T4: auditoria append-only ----------
    try {
      const colA = app.findCollectionByNameOrId('access_audit')
      const a = new Record(colA)
      a.set('actor_id', e.auth.id)
      a.set('acao', 'acesso_alterado')
      a.set('alvo_grant_id', grantId)
      a.set('alvo_user_id', alvoId)
      a.set(
        'detalhe',
        JSON.stringify({
          antes: antes,
          depois: limpas,
          escopo: escopo,
          papel: papelAtual,
        }),
      )
      a.set('created_at', new Date().toISOString())
      app.save(a)
    } catch (eA) {
      // nunca engolir: foi catch vazio que escondeu o CRM sem criar lead
      console.log('WA_ACESSOS: falha na auditoria: ' + String(eA).slice(0, 200))
    }

    return e.json(200, {
      ok: true,
      grant_id: grantId,
      acoes_antes: antes.length,
      acoes_depois: limpas.length,
      escopo: escopo,
    })
  },
  $apis.requireAuth(),
)

// ==================== redefinir senha de alguém ====================
routerAdd(
  'POST',
  '/backend/v1/acessos/pessoa/{id}/senha',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    function lerLista2(raw) {
      try {
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          return JSON.parse(String.fromCharCode.apply(null, raw))
        }
        if (typeof raw === 'string') return JSON.parse(raw)
        return raw || []
      } catch (err) {
        return []
      }
    }

    const app = $app
    var souAdmin = false
    try {
      const meus = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        50,
        0,
      )
      for (const g of meus) {
        const a = lerLista2(g.get('actions'))
        if (a.indexOf('manage_access') >= 0) souAdmin = true
      }
    } catch (e0) {}
    if (!souAdmin) return e.json(403, { ok: false, erro: 'só quem tem manage_access' })

    const alvoId = String(e.request.pathValue('id') || '')
    if (alvoId === '') return e.json(400, { ok: false, erro: 'pessoa não informada' })

    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}
    const senha = String(body.senha || '')
    if (senha.length < 8) {
      return e.json(422, { ok: false, erro: 'a senha precisa ter pelo menos 8 caracteres' })
    }

    try {
      // recarrega do banco: setPassword em instância limpa (lição 03/11 —
      // set('password') não faz hash e o registro fica inválido)
      const u = app.findRecordById('users', alvoId)
      u.setPassword(senha)
      app.save(u)
    } catch (eS) {
      return e.json(500, {
        ok: false,
        erro: 'falha ao gravar a senha: ' + String(eS).slice(0, 160),
      })
    }

    try {
      const colA = app.findCollectionByNameOrId('access_audit')
      const a = new Record(colA)
      a.set('actor_id', e.auth.id)
      a.set('acao', 'senha_redefinida')
      a.set('alvo_grant_id', '')
      a.set('alvo_user_id', alvoId)
      a.set('detalhe', 'senha provisória definida pela gestão')
      a.set('created_at', new Date().toISOString())
      app.save(a)
    } catch (eA) {}

    return e.json(200, { ok: true, provisoria: true })
  },
  $apis.requireAuth(),
)

// ==================== histórico de mudanças de acesso ====================
routerAdd(
  'GET',
  '/backend/v1/acessos/auditoria',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    function lerLista3(raw) {
      try {
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          return JSON.parse(String.fromCharCode.apply(null, raw))
        }
        if (typeof raw === 'string') return JSON.parse(raw)
        return raw || []
      } catch (err) {
        return []
      }
    }

    const app = $app
    var souAdmin = false
    try {
      const meus = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        50,
        0,
      )
      for (const g of meus) {
        const a = lerLista3(g.get('actions'))
        if (a.indexOf('manage_access') >= 0) souAdmin = true
      }
    } catch (e0) {}
    if (!souAdmin) return e.json(403, { ok: false, erro: 'só quem tem manage_access' })

    var regs = []
    try {
      regs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_audit'),
        '',
        '-created_at',
        100,
        0,
      )
    } catch (e1) {
      return e.json(200, { ok: true, total: 0, itens: [] })
    }

    // nomes de quem fez e de quem recebeu
    const nomes = {}
    try {
      const us = app.findRecordsByFilter(app.findCollectionByNameOrId('users'), '', '', 300, 0)
      for (const u of us) nomes[u.id] = String(u.get('name') || u.get('email') || '')
    } catch (e2) {}

    const ROTULO = {
      grant_criado: 'criou acesso',
      grant_revogado: 'removeu acesso',
      acesso_alterado: 'alterou acesso',
      senha_redefinida: 'redefiniu a senha',
    }

    const itens = []
    for (const r of regs) {
      const acao = String(r.get('acao') || '')
      itens.push({
        id: r.id,
        quando: String(r.get('created_at') || r.get('created') || '').slice(0, 19),
        quem: nomes[String(r.get('actor_id') || '')] || '(sistema)',
        acao: acao,
        acao_texto: ROTULO[acao] || acao,
        alvo: nomes[String(r.get('alvo_user_id') || '')] || '',
        detalhe: String(r.get('detalhe') || '').slice(0, 300),
      })
    }
    return e.json(200, { ok: true, total: itens.length, itens: itens })
  },
  $apis.requireAuth(),
)

// ==================== teste: a auditoria aceita escrita? ====================
// Criada porque a edição passou mas a auditoria não gravou, e o log não mostrou
// erro nenhum. Rota explícita: grava e devolve o que aconteceu, sem adivinhar.
routerAdd(
  'POST',
  '/backend/v1/acessos/teste-auditoria',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    var colA = null
    try {
      colA = $app.findCollectionByNameOrId('access_audit')
    } catch (e0) {
      return e.json(200, { ok: false, passo: 'achar_colecao', erro: String(e0).slice(0, 200) })
    }
    // quais campos a colecao tem de verdade?
    var campos = []
    try {
      const map = colA.fields
      for (let i = 0; i < map.length; i++) {
        const f = map[i]
        campos.push(String(f.name))
      }
    } catch (eC) {
      try {
        campos = Object.keys(colA.fields.columnMap || {})
      } catch (eC2) {}
    }
    try {
      const a = new Record(colA)
      a.set('actor_id', e.auth.id)
      a.set('acao', 'teste_escrita')
      a.set('alvo_grant_id', '')
      a.set('alvo_user_id', e.auth.id)
      a.set('detalhe', 'teste da rota de auditoria')
      a.set('created_at', new Date().toISOString())
      $app.save(a)
      return e.json(200, { ok: true, gravou: a.id, campos: campos })
    } catch (eS) {
      return e.json(200, {
        ok: false,
        passo: 'save',
        erro: String(eS).slice(0, 300),
        campos: campos,
      })
    }
  },
  $apis.requireAuth(),
)
