/// <reference path="../pb_data/types.d.ts" />
/**
 * SUSPENDER QUEM SAI DA EMPRESA (CA-3-34, 04/11).
 *
 * O buraco que isso fecha: hoje, se alguém sai, o acesso continua valendo até
 * a gestão revogar na mão. E os leads ficam parados na carteira de quem não
 * está mais lá — cliente esperando alguém que nunca vai responder.
 *
 * O QUE "SUSPENDER" FAZ, EM ORDEM
 *   1. troca a senha por uma aleatória  → login deixa de funcionar na hora
 *   2. revoga os grants ativos          → sem permissão, mesmo com token antigo
 *   3. devolve os leads ao RODÍZIO      → ninguém fica sem dono
 *   4. fecha as conexões de WhatsApp    → o número pessoal para de receber
 *   5. registra tudo em access_audit    → com quem, quando e quantos leads
 *
 * O QUE NÃO FAZ (de propósito)
 *   - não apaga o usuário: o histórico das conversas aponta para ele, e
 *     apagar quebraria a trilha dos leads que ele atendeu
 *   - não apaga lead nenhum: só troca o dono
 *
 * ROTAS
 *   POST /backend/v1/acessos/pessoa/{id}/suspender   { motivo? }
 *   POST /backend/v1/acessos/pessoa/{id}/reativar
 *   GET  /backend/v1/acessos/suspensos
 *
 * TRAVAS
 *   - não dá para suspender a si mesmo
 *   - não dá para suspender o último que gerencia acessos
 *   - suspender exige manage_access
 *
 * JSVM: tudo INLINE (função no topo quebra o hook inteiro).
 */

// ==================== suspender ====================
routerAdd(
  'POST',
  '/backend/v1/acessos/pessoa/{id}/suspender',
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
    const colL = app.findCollectionByNameOrId('crm_leads')
    const colCx = app.findCollectionByNameOrId('whatsapp_conexoes')
    const colU = app.findCollectionByNameOrId('users')
    const hoje = new Date().toISOString().slice(0, 10)
    const agoraISO = new Date().toISOString()

    // ---------- guard ----------
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

    // ---------- TRAVA: não suspende a si mesmo ----------
    if (alvoId === e.auth.id) {
      return e.json(403, { ok: false, erro: 'não é possível suspender o seu próprio acesso' })
    }

    // ---------- TRAVA: não deixa o sistema sem administrador ----------
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
    var alvoEraAdmin = false
    for (const g of todosGrants) {
      if (String(g.get('user_id')) !== alvoId) continue
      const a = lerLista(g.get('actions'))
      if (a.indexOf('manage_access') >= 0) alvoEraAdmin = true
    }
    if (alvoEraAdmin && outrosAdmins === 0) {
      return e.json(422, {
        ok: false,
        erro: 'esta pessoa é a última que gerencia acessos. Dê manage_access a outra antes de suspender.',
      })
    }

    // ---------- 1. senha aleatória (login morre na hora) ----------
    var nomeAlvo = ''
    try {
      const u = app.findRecordById(colU, alvoId)
      nomeAlvo = String(u.get('name') || u.get('email') || '')
      const rnd = 'Susp-' + Math.random().toString(36).slice(2) + new Date().getTime().toString(36)
      u.setPassword(rnd)
      app.save(u)
    } catch (e1) {
      return e.json(500, {
        ok: false,
        erro: 'falha ao bloquear o login: ' + String(e1).slice(0, 160),
      })
    }

    // ---------- 2. revoga grants ----------
    var revogados = 0
    try {
      for (const g of todosGrants) {
        if (String(g.get('user_id')) !== alvoId) continue
        if (String(g.get('revoked_at') || '') !== '') continue
        g.set('revoked_at', agoraISO)
        g.set('revoked_reason', 'suspenso em ' + hoje)
        app.save(g)
        revogados++
      }
    } catch (e2) {}

    // ---------- 3. devolve os leads ao RODÍZIO ----------
    // Mesma regra do resto do sistema: só vendedor recebe (tem read_conversas/
    // read_leads e NÃO é gestão de escopo '*'). Distribui pelo de menor carga.
    var vendedores = []
    try {
      const us = app.findRecordsByFilter(colU, '', '', 300, 0)
      const carga = {}
      var todosLeads = []
      try {
        todosLeads = app.findRecordsByFilter(colL, 'fixture=false', '', 6000, 0)
      } catch (eL) {}
      for (const l of todosLeads) {
        const ow = String(l.get('owner_id') || '')
        if (ow === '' || ow === alvoId) continue
        const st = String(l.get('status') || 'entrada_lead')
        if (st === 'venda_realizada' || st === 'finalizado' || st === 'descartado') continue
        carga[ow] = (carga[ow] || 0) + 1
      }
      for (const u of us) {
        if (u.id === alvoId) continue
        const em = String(u.get('email') || '')
        const nm = String(u.get('name') || '')
        if (em === '' || em.toLowerCase().indexOf('fixture') >= 0) continue
        if (nm.toLowerCase().indexOf('fixture') >= 0) continue
        var ehVend = false
        var ehGestao = false
        try {
          const gs = app.findRecordsByFilter(
            colG,
            "user_id='" + u.id + "' && revoked_at=''",
            '',
            20,
            0,
          )
          for (const g of gs) {
            const a = lerLista(g.get('actions'))
            const sc = lerLista(g.get('scope_accounts'))
            if (Array.isArray(sc) && sc.indexOf('*') >= 0) ehGestao = true
            if (a.indexOf('read_conversas') >= 0 || a.indexOf('read_leads') >= 0) ehVend = true
          }
        } catch (eG) {}
        if (!ehVend || ehGestao) continue
        vendedores.push({ id: u.id, nome: nm || em, carga: carga[u.id] || 0 })
      }
    } catch (e3) {}

    // ---------- 3. carteira de quem sai vai para a GESTÃO decidir ----------
    // CA-3-69 / RN-134 (mudança de 05/11): cliente do vendedor X fica com X.
    // Se X saiu, os leads NÃO vão para o rodízio — vão para "precisa de ação",
    // onde a gestão escolhe para quem passar. Trocar cliente de mãos sozinho
    // foi o que a SPEC proibiu.
    //
    // O `vendedores` acima continua sendo calculado (a lista serve para a tela
    // sugerir o destino), mas NINGUÉM é atribuído aqui.
    var movidos = 0
    var paraGestao = 0
    if (vendedores.length >= 0) {
      try {
        const meus = app.findRecordsByFilter(colL, "owner_id='" + alvoId + "'", '', 6000, 0)
        const colEv = app.findCollectionByNameOrId('crm_lead_events')
        var colPA = null
        try {
          colPA = app.findCollectionByNameOrId('precisa_acao')
        } catch (ePA) {}
        for (const l of meus) {
          try {
            // NÃO troca o dono: o lead continua com a pessoa suspensa até a
            // gestão decidir. Assim ninguém herda carteira sem saber.
            if (colPA) {
              const chave = 'suspenso|' + l.id
              var jaTem = false
              try {
                const ja = app.findRecordsByFilter(colPA, "dedupe_key='" + chave + "'", '', 1, 0)
                if (ja && ja.length > 0) jaTem = true
              } catch (eJ) {}
              if (!jaTem) {
                const item = new Record(colPA)
                item.set('lead', l.id)
                item.set('dono_anterior', alvoId)
                item.set('dono_anterior_nome', nomeAlvo || alvoId)
                item.set('motivo', 'vendedor_suspenso')
                item.set('resolvido', false)
                item.set('fixture', false)
                item.set('dedupe_key', chave)
                app.save(item)
                paraGestao++
              }
            }
            try {
              const ev = new Record(colEv)
              ev.set('lead_id', l.id)
              ev.set('tipo', 'status')
              ev.set(
                'texto',
                'Aguardando a gestão: ' +
                  (nomeAlvo || 'o responsável') +
                  ' saiu da empresa em ' +
                  hoje +
                  '. O cliente NÃO foi para o rodízio.',
              )
              ev.set('fixture', false)
              app.save(ev)
            } catch (eEv) {}
          } catch (eL2) {}
        }
        movidos = paraGestao
      } catch (e4) {}
    }

    // ---------- 4. fecha as conexões de WhatsApp da pessoa ----------
    var conexoesFechadas = 0
    try {
      const cxs = app.findRecordsByFilter(colCx, "vendedor_user='" + alvoId + "'", '', 50, 0)
      for (const c of cxs) {
        c.set('ativo', false)
        app.save(c)
        conexoesFechadas++
      }
    } catch (e5) {}

    // ---------- 5. trilha ----------
    try {
      const colA = app.findCollectionByNameOrId('access_audit')
      const a = new Record(colA)
      a.set('at', agoraISO)
      a.set('actor', e.auth.id)
      a.set('acao', 'pessoa_suspensa')
      a.set('alvo', alvoId)
      a.set(
        'detalhe',
        'grants revogados=' +
          revogados +
          ' leads redistribuídos=' +
          movidos +
          ' conexões fechadas=' +
          conexoesFechadas,
      )
      app.save(a)
    } catch (e6) {}

    return e.json(200, {
      ok: true,
      pessoa: nomeAlvo,
      grants_revogados: revogados,
      // CA-3-69: a carteira NÃO é redistribuída. Ela fica com a pessoa
      // suspensa até a gestão decidir, e cada lead vira um item da fila.
      leads_para_gestao: movidos,
      leads_redistribuidos: 0,
      conexoes_fechadas: conexoesFechadas,
    })
  },
  $apis.requireAuth(),
)

// ==================== reativar ====================
routerAdd(
  'POST',
  '/backend/v1/acessos/pessoa/{id}/reativar',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    function lerListaR(raw) {
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
        const a = lerListaR(g.get('actions'))
        if (a.indexOf('manage_access') >= 0) souAdmin = true
      }
    } catch (e0) {}
    if (!souAdmin) return e.json(403, { ok: false, erro: 'só quem tem manage_access' })

    const alvoId = String(e.request.pathValue('id') || '')
    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}
    const senha = String(body.senha || 'Haisan@2026')

    var nome = ''
    try {
      const u = app.findRecordById('users', alvoId)
      nome = String(u.get('name') || u.get('email') || '')
      u.setPassword(senha)
      app.save(u)
    } catch (e1) {
      return e.json(500, { ok: false, erro: 'falha ao reativar: ' + String(e1).slice(0, 160) })
    }

    // devolve o mínimo para a pessoa voltar a entrar: conversas + leads
    var voltou = false
    try {
      const colG = app.findCollectionByNameOrId('access_grants')
      const antigos = app.findRecordsByFilter(colG, "user_id='" + alvoId + "'", '-created', 20, 0)
      for (const g of antigos) {
        if (String(g.get('revoked_at') || '') !== '') {
          g.set('revoked_at', '')
          g.set('revoked_reason', '')
          app.save(g)
          voltou = true
          break
        }
      }
      if (!voltou) {
        const novo = new Record(colG)
        novo.set('user_id', alvoId)
        novo.set('role', 'vendedor')
        novo.set('actions', JSON.stringify(['read_leads', 'read_conversas']))
        novo.set('scope_accounts', JSON.stringify([]))
        novo.set('scope_channels', JSON.stringify([]))
        novo.set('valid_from', '')
        novo.set('valid_until', '')
        novo.set('revoked_at', '')
        novo.set('approved_by', e.auth.id)
        novo.set('approved_at', new Date().toISOString())
        novo.set('version', 1)
        novo.set('note', 'reativado em ' + new Date().toISOString().slice(0, 10))
        app.save(novo)
        voltou = true
      }
    } catch (e2) {}

    try {
      const colA = app.findCollectionByNameOrId('access_audit')
      const a = new Record(colA)
      a.set('at', new Date().toISOString())
      a.set('actor', e.auth.id)
      a.set('acao', 'pessoa_reativada')
      a.set('alvo', alvoId)
      a.set('detalhe', 'senha provisória definida; grant reativado=' + voltou)
      app.save(a)
    } catch (e3) {}

    return e.json(200, { ok: true, pessoa: nome, grant_reativado: voltou })
  },
  $apis.requireAuth(),
)

// ==================== lista de suspensos ====================
routerAdd(
  'GET',
  '/backend/v1/acessos/suspensos',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    function lerListaS(raw) {
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
        const a = lerListaS(g.get('actions'))
        if (a.indexOf('manage_access') >= 0) souAdmin = true
      }
    } catch (e0) {}
    if (!souAdmin) return e.json(403, { ok: false, erro: 'só quem tem manage_access' })

    // suspenso = não tem nenhum grant ativo mas tem histórico de grant revogado
    var users = []
    try {
      users = app.findRecordsByFilter(app.findCollectionByNameOrId('users'), '', 'name', 300, 0)
    } catch (e1) {}

    const itens = []
    for (const u of users) {
      var ativos = 0
      var revogados = 0
      var ultimoMotivo = ''
      try {
        const gs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('access_grants'),
          "user_id='" + u.id + "'",
          '-created',
          50,
          0,
        )
        for (const g of gs) {
          if (String(g.get('revoked_at') || '') === '') ativos++
          else {
            revogados++
            if (ultimoMotivo === '') ultimoMotivo = String(g.get('revoked_reason') || '')
          }
        }
      } catch (e2) {}
      if (ativos > 0 || revogados === 0) continue
      itens.push({
        id: u.id,
        nome: String(u.get('name') || ''),
        email: String(u.get('email') || ''),
        grants_revogados: revogados,
        motivo: ultimoMotivo,
      })
    }
    return e.json(200, { ok: true, total: itens.length, itens: itens })
  },
  $apis.requireAuth(),
)
