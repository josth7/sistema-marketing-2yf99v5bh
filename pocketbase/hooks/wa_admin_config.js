/// <reference path="../pb_data/types.d.ts" />
/**
 * ADMINISTRAÇÃO — avisos liga/desliga (CA-3-48, SPEC-3-010, 06/11).
 *
 * **O que a tela controla:**
 *   1. **Aviso por e-mail** — ligado/desligado e quem recebe. Padrão: desligado.
 *   2. **Resumo no WhatsApp** — destinatários, horários e dias. Padrão: desligado.
 *   3. **Quem pode responder pelo sistema** — lista de pessoas.
 *
 * **Versionado:** cada salvamento cria uma versão nova com autor. Nada é
 * sobrescrito; vale sempre a de maior `versao`. Assim dá para ver quem ligou o
 * quê e voltar atrás.
 *
 * **Só a gestão** lê e escreve (escopo `*`). Vendedor não vê esta tela.
 *
 * Rotas:
 *   GET  /backend/v1/admin/config             → configuração atual + histórico
 *   POST /backend/v1/admin/config             → salva (cria versão nova)
 *   POST /backend/v1/admin/config/voltar      → volta para uma versão
 *
 * JSVM: helpers INLINE.
 */
routerAdd(
  'GET',
  '/backend/v1/admin/config',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    function lerL(raw) {
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
    const hoje = new Date().toISOString().slice(0, 10)

    // ---------- só gestão ----------
    var ehGestao = false
    try {
      const meus = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      for (const g of meus) {
        const de = String(g.get('valid_from') || '')
        const ate = String(g.get('valid_until') || '')
        if (de !== '' && de.slice(0, 10) > hoje) continue
        if (ate !== '' && ate.slice(0, 10) < hoje) continue
        const esc = lerL(g.get('scope_accounts'))
        if (Array.isArray(esc) && esc.indexOf('*') >= 0) ehGestao = true
      }
    } catch (e0) {}
    if (!ehGestao) return e.json(403, { ok: false, erro: 'só a gestão' })

    const out = { ok: true, atual: null, historico: [], pessoas: [] }

    var vs = []
    try {
      vs = app.findRecordsByFilter(app.findCollectionByNameOrId('admin_config'), '', '', 200, 0)
    } catch (e1) {
      out.ok = false
      out.erro = String(e1).slice(0, 140)
      return e.json(200, out)
    }

    vs.sort(function (a, b) {
      return Number(b.get('versao') || 0) - Number(a.get('versao') || 0)
    })

    for (const v of vs) {
      const item = {
        id: v.id,
        versao: Number(v.get('versao') || 0),
        email_ativo: v.get('email_ativo') === true,
        // CA-3-112: chave do aviso ao vendedor (nasce ligada)
        aviso_vendedor_ativo: v.get('aviso_vendedor_ativo') !== false,
        email_destinatarios: lerL(v.get('email_destinatarios')),
        resumo_ativo: v.get('resumo_ativo') === true,
        resumo_horarios: lerL(v.get('resumo_horarios')),
        resumo_dias: lerL(v.get('resumo_dias')),
        resumo_destinatarios: lerL(v.get('resumo_destinatarios')),
        responder_sistema: lerL(v.get('responder_sistema')),
        autor_nome: String(v.get('autor_nome') || ''),
        observacao: String(v.get('observacao') || ''),
        preco_marketing: Number(v.get('preco_marketing') || 0),
        preco_utilidade: Number(v.get('preco_utilidade') || 0),
        criado: String(v.get('created') || '').slice(0, 16),
      }
      if (!out.atual) out.atual = item
      else out.historico.push(item)
    }

    // pessoas para os seletores
    try {
      const nomes = {}
      for (const u of app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        '',
        '',
        300,
        0,
      )) {
        const em = String(u.get('email') || '')
        const nm = String(u.get('name') || '')
        if (em.toLowerCase().indexOf('fixture') >= 0) continue
        if (nm.toLowerCase().indexOf('fixture') >= 0) continue
        nomes[u.id] = nm || em
      }
      for (const id in nomes) out.pessoas.push({ id: id, nome: nomes[id] })
    } catch (e2) {}
    out.pessoas.sort(function (a, b) {
      return String(a.nome).localeCompare(String(b.nome))
    })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)

// ==================== SALVAR ====================
routerAdd(
  'POST',
  '/backend/v1/admin/config',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    function lerA(raw) {
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
    const hoje = new Date().toISOString().slice(0, 10)
    var ehGestao = false
    var nomeAutor = ''
    try {
      const meus = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      for (const g of meus) {
        const de = String(g.get('valid_from') || '')
        const ate = String(g.get('valid_until') || '')
        if (de !== '' && de.slice(0, 10) > hoje) continue
        if (ate !== '' && ate.slice(0, 10) < hoje) continue
        const esc = lerA(g.get('scope_accounts'))
        if (Array.isArray(esc) && esc.indexOf('*') >= 0) ehGestao = true
      }
      const eu = app.findRecordById('users', e.auth.id)
      nomeAutor = String(eu.get('name') || eu.get('email') || '')
    } catch (e0) {}
    if (!ehGestao) return e.json(403, { ok: false, erro: 'só a gestão altera a Administração' })

    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}

    // ---------- versão nova (append-only) ----------
    var maior = 0
    try {
      const vs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('admin_config'),
        '',
        '',
        500,
        0,
      )
      for (const v of vs) {
        const n = Number(v.get('versao') || 0)
        if (n > maior) maior = n
      }
    } catch (e1) {}

    // regra: e-mail só com pelo menos 1 destinatário
    const emailDest = Array.isArray(body.email_destinatarios) ? body.email_destinatarios : []
    const emailAtivo = body.email_ativo === true
    if (emailAtivo && emailDest.length === 0) {
      return e.json(422, {
        ok: false,
        erro: 'para ligar o aviso por e-mail, escolha pelo menos uma pessoa',
      })
    }
    // regra: resumo só com destinatário e horário
    const resumoDest = Array.isArray(body.resumo_destinatarios) ? body.resumo_destinatarios : []
    const resumoHor = Array.isArray(body.resumo_horarios) ? body.resumo_horarios : []
    const resumoAtivo = body.resumo_ativo === true
    if (resumoAtivo && (resumoDest.length === 0 || resumoHor.length === 0)) {
      return e.json(422, {
        ok: false,
        erro: 'para ligar o resumo, escolha quem recebe e pelo menos um horário',
      })
    }

    try {
      const col = app.findCollectionByNameOrId('admin_config')
      const nv = new Record(col)
      nv.set('versao', maior + 1)
      nv.set('email_ativo', emailAtivo)
      // CA-3-112: a chave nasce LIGADA; só desliga se a gestão desligar
      nv.set(
        'aviso_vendedor_ativo',
        body.aviso_vendedor_ativo === undefined ? true : body.aviso_vendedor_ativo === true,
      )
      nv.set('email_destinatarios', JSON.stringify(emailDest))
      nv.set('resumo_ativo', resumoAtivo)
      nv.set('resumo_horarios', JSON.stringify(resumoHor))
      nv.set('resumo_dias', JSON.stringify(Array.isArray(body.resumo_dias) ? body.resumo_dias : []))
      nv.set('resumo_destinatarios', JSON.stringify(resumoDest))
      nv.set(
        'responder_sistema',
        JSON.stringify(Array.isArray(body.responder_sistema) ? body.responder_sistema : []),
      )
      nv.set('autor_id', e.auth.id)
      nv.set('autor_nome', nomeAutor)
      // CA-3-83 (06/11): preço da mensagem em CENTAVOS, por categoria.
      // É o que permite a tela de campanha estimar o custo antes de aprovar.
      // O preço é gravado SEMPRE (0 quando não vem): antes o `!== undefined`
      // deixava passar e a versão nova nascia com o campo vazio, então a tela
      // nunca encontrava o preço e não calculava o custo.
      const precoM = Number(body.preco_marketing || 0)
      const precoU = Number(body.preco_utilidade || 0)
      nv.set('preco_marketing', isNaN(precoM) ? 0 : precoM)
      nv.set('preco_utilidade', isNaN(precoU) ? 0 : precoU)
      nv.set('observacao', String(body.observacao || '').slice(0, 300))
      app.save(nv)
      return e.json(200, {
        ok: true,
        versao: maior + 1,
        id: nv.id,
        autor: nomeAutor,
        email_ativo: emailAtivo,
        resumo_ativo: resumoAtivo,
      })
    } catch (e2) {
      return e.json(500, { ok: false, erro: 'não consegui salvar: ' + String(e2).slice(0, 140) })
    }
  },
  $apis.requireAuth(),
)

// ==================== VOLTAR PARA UMA VERSÃO ====================
routerAdd(
  'POST',
  '/backend/v1/admin/config/voltar',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    function lerA2(raw) {
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
    const hoje = new Date().toISOString().slice(0, 10)
    var ehGestao = false
    var nomeAutor = ''
    try {
      const meus = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      for (const g of meus) {
        const de = String(g.get('valid_from') || '')
        const ate = String(g.get('valid_until') || '')
        if (de !== '' && de.slice(0, 10) > hoje) continue
        if (ate !== '' && ate.slice(0, 10) < hoje) continue
        const esc = lerA2(g.get('scope_accounts'))
        if (Array.isArray(esc) && esc.indexOf('*') >= 0) ehGestao = true
      }
      const eu = app.findRecordById('users', e.auth.id)
      nomeAutor = String(eu.get('name') || eu.get('email') || '')
    } catch (e0) {}
    if (!ehGestao) return e.json(403, { ok: false, erro: 'só a gestão' })

    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}
    const alvoVersao = Number(body.versao || 0)
    if (alvoVersao <= 0) return e.json(422, { ok: false, erro: 'informe a versão' })

    var alvo = null
    var maior = 0
    try {
      const vs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('admin_config'),
        '',
        '',
        500,
        0,
      )
      for (const v of vs) {
        const n = Number(v.get('versao') || 0)
        if (n > maior) maior = n
        if (n === alvoVersao) alvo = v
      }
    } catch (e1) {}
    if (!alvo) return e.json(404, { ok: false, erro: 'versão não encontrada' })

    // copia os valores do alvo para uma versão nova (não apaga o histórico)
    try {
      const col = app.findCollectionByNameOrId('admin_config')
      const nv = new Record(col)
      nv.set('versao', maior + 1)
      nv.set('email_ativo', alvo.get('email_ativo') === true)
      nv.set('email_destinatarios', String(alvo.get('email_destinatarios') || '[]'))
      nv.set('resumo_ativo', alvo.get('resumo_ativo') === true)
      nv.set('resumo_horarios', String(alvo.get('resumo_horarios') || '[]'))
      nv.set('resumo_dias', String(alvo.get('resumo_dias') || '[]'))
      nv.set('resumo_destinatarios', String(alvo.get('resumo_destinatarios') || '[]'))
      nv.set('responder_sistema', String(alvo.get('responder_sistema') || '[]'))
      nv.set('autor_id', e.auth.id)
      nv.set('autor_nome', nomeAutor)
      nv.set('preco_marketing', Number(alvo.get('preco_marketing') || 0))
      nv.set('preco_utilidade', Number(alvo.get('preco_utilidade') || 0))
      nv.set('observacao', 'Voltou para a versão ' + alvoVersao)
      app.save(nv)
      return e.json(200, { ok: true, versao: maior + 1, voltou_para: alvoVersao })
    } catch (e2) {
      return e.json(500, { ok: false, erro: String(e2).slice(0, 140) })
    }
  },
  $apis.requireAuth(),
)
