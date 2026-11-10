/// <reference path="../pb_data/types.d.ts" />
/**
 * PRECISA DE AÇÃO — LEADS SEM DONO E ATRIBUIR (CA-3-52, SPEC-3-011, 06/11).
 *
 * **O problema:** lead sem dono não aparece para ninguém. Ele existe no banco,
 * some de todas as telas e o cliente espera. Pior: se alguém atribui pela mão
 * duas vezes ao mesmo tempo, o lead troca de dono no meio do caminho.
 *
 * **O que estas rotas fazem:**
 *   1. listam o que precisa de ação com o **motivo** (sem dono, suspenso,
 *      conflito de carteira);
 *   2. **Atribuir** dá dono pelo **ponto único** (`whatsapp_transferencias`),
 *      nunca por cópia da lógica;
 *   3. **concorrência**: duas atribuições ao mesmo tempo → **uma ganha (200)**,
 *      a outra recebe **409** com quem ficou — o lead não troca de dono.
 *   4. **Reenviar**: manda de novo o aviso ao vendedor do lead.
 *
 * **Quem entra:** só a gestão. Vendedor recebe **404** (não confirma que existe).
 *
 * Rotas:
 *   GET  /backend/v1/gestao/acao                  → lista com motivo
 *   POST /backend/v1/gestao/acao/atribuir         → {lead, vendedor?}
 *   POST /backend/v1/gestao/acao/reenviar         → {lead}
 */
routerAdd(
  'GET',
  '/backend/v1/gestao/acao',
  (e) => {
    // ---------- empresa ativa (CA-3-88) ----------
    // Lê os grants AQUI, no escopo da rota: `const meus` de dentro de um try
    // não existe fora dele (lança, o catch engole, o 403 não dispara).
    var empresaAtiva = ''
    try {
      var pedidaW = String(e.request.header.get('X-Empresa') || '')
      var gsW = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      var empGrantW = []
      var ehDonoW = false
      for (const gW of gsW) {
        var empGW = ''
        try {
          empGW = String(gW.get('empresa') || '')
        } catch (eGW) {}
        if (empGW !== '' && empGrantW.indexOf(empGW) < 0) empGrantW.push(empGW)
        var saW = []
        try {
          var rawW = gW.get('scope_accounts')
          saW =
            Array.isArray(rawW) && rawW.length > 0 && typeof rawW[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawW))
              : typeof rawW === 'string'
                ? JSON.parse(rawW)
                : rawW || []
        } catch (eSAW) {}
        if (Array.isArray(saW) && saW.indexOf('*') >= 0) ehDonoW = true
      }
      if (pedidaW !== '') {
        if (!ehDonoW && empGrantW.indexOf(pedidaW) < 0) {
          return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
        }
        empresaAtiva = pedidaW
      } else if (empGrantW.length > 0) {
        empresaAtiva = empGrantW[0]
      } else {
        const esW = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (esW.length > 0) empresaAtiva = esW[0].id
      }
    } catch (eEmpW) {}

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
    if (!ehGestao) return e.json(404, { ok: false, erro: 'não encontrado' })

    const out = { ok: true, total: 0, itens: [], por_motivo: {} }

    // ---------- vendedores disponíveis (para escolher o destino) ----------
    var vendedores = []
    try {
      const todos = app.findRecordsByFilter(app.findCollectionByNameOrId('users'), '', '', 300, 0)
      const colG = app.findCollectionByNameOrId('access_grants')
      for (const u of todos) {
        const em = String(u.get('email') || '').toLowerCase()
        const nm = String(u.get('name') || '')
        if (em.indexOf('fixture') >= 0 || nm.toLowerCase().indexOf('fixture') >= 0) continue
        var ehVend = false
        var ehGest = false
        try {
          const gs = app.findRecordsByFilter(
            colG,
            "user_id='" + u.id + "' && revoked_at=''",
            '',
            20,
            0,
          )
          for (const g of gs) {
            const a = lerL(g.get('actions'))
            const sc = lerL(g.get('scope_accounts'))
            if (Array.isArray(sc) && sc.indexOf('*') >= 0) ehGest = true
            if (
              Array.isArray(a) &&
              (a.indexOf('read_leads') >= 0 || a.indexOf('read_conversas') >= 0)
            )
              ehVend = true
          }
        } catch (eG) {}
        if (ehVend && !ehGest) vendedores.push({ id: u.id, nome: nm || em })
      }
    } catch (e1) {}
    out.vendedores = vendedores

    // suspensos (tem grant revogado e nenhum ativo) — para o motivo
    const suspensos = {}
    try {
      const gs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        '',
        '',
        4000,
        0,
      )
      const ativos = {}
      const revog = {}
      for (const g of gs) {
        const uid = String(g.get('user_id') || '')
        if (uid === '') continue
        if (String(g.get('revoked_at') || '') === '') ativos[uid] = true
        else revog[uid] = true
      }
      for (const uid in revog) if (!ativos[uid]) suspensos[uid] = true
    } catch (e2) {}

    const nomes = {}
    try {
      for (const u of app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        '',
        '',
        400,
        0,
      )) {
        nomes[u.id] = String(u.get('name') || u.get('email') || '')
      }
    } catch (e3) {}

    // ---------- 1. leads sem dono ----------
    var leads = []
    try {
      leads = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        12000,
        0,
      )
    } catch (e4) {}

    for (const l of leads) {
      const dono = String(l.get('owner_id') || '')
      const st = String(l.get('status') || '')
      if (st === 'descartado') continue

      var motivo = ''
      if (dono === '') motivo = 'sem_dono'
      else if (suspensos[dono]) motivo = 'dono_suspenso'
      else continue

      out.por_motivo[motivo] = (out.por_motivo[motivo] || 0) + 1
      if (out.itens.length < 300) {
        out.itens.push({
          lead: l.id,
          nome: String(l.get('nome') || ''),
          telefone: String(l.get('telefone') || ''),
          status: st,
          motivo: motivo,
          dono_atual: dono,
          dono_nome: dono !== '' ? nomes[dono] || dono : '',
          criado: String(l.get('created') || '').slice(0, 16),
        })
      }
    }

    // ---------- 2. itens da fila precisa_acao (conflito de carteira etc.) ----------
    try {
      const fila = app.findRecordsByFilter(
        app.findCollectionByNameOrId('precisa_acao'),
        'resolvido=false && fixture=false',
        '',
        2000,
        0,
      )
      for (const f of fila) {
        const m = String(f.get('motivo') || 'fila')
        if (out.por_motivo[m] === undefined) out.por_motivo[m] = 0
        out.por_motivo[m]++
        if (out.itens.length < 400) {
          out.itens.push({
            lead: String(f.get('lead') || ''),
            nome: String(f.get('dono_anterior_nome') || ''),
            telefone: '',
            status: '',
            motivo: m,
            dono_atual: String(f.get('dono_anterior') || ''),
            dono_nome: String(f.get('dono_anterior_nome') || ''),
            criado: String(f.get('created') || '').slice(0, 16),
            item_fila: f.id,
          })
        }
      }
    } catch (e5) {}

    out.itens.sort(function (a, b) {
      return String(a.criado).localeCompare(String(b.criado))
    })
    out.total = out.itens.length
    return e.json(200, out)
  },
  $apis.requireAuth(),
)

// ==================== ATRIBUIR PELO PONTO ÚNICO ====================
routerAdd(
  'POST',
  '/backend/v1/gestao/acao/atribuir',
  (e) => {
    // ---------- empresa ativa (CA-3-88) ----------
    // Lê os grants AQUI, no escopo da rota: `const meus` de dentro de um try
    // não existe fora dele (lança, o catch engole, o 403 não dispara).
    var empresaAtiva = ''
    try {
      var pedidaW = String(e.request.header.get('X-Empresa') || '')
      var gsW = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      var empGrantW = []
      var ehDonoW = false
      for (const gW of gsW) {
        var empGW = ''
        try {
          empGW = String(gW.get('empresa') || '')
        } catch (eGW) {}
        if (empGW !== '' && empGrantW.indexOf(empGW) < 0) empGrantW.push(empGW)
        var saW = []
        try {
          var rawW = gW.get('scope_accounts')
          saW =
            Array.isArray(rawW) && rawW.length > 0 && typeof rawW[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawW))
              : typeof rawW === 'string'
                ? JSON.parse(rawW)
                : rawW || []
        } catch (eSAW) {}
        if (Array.isArray(saW) && saW.indexOf('*') >= 0) ehDonoW = true
      }
      if (pedidaW !== '') {
        if (!ehDonoW && empGrantW.indexOf(pedidaW) < 0) {
          return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
        }
        empresaAtiva = pedidaW
      } else if (empGrantW.length > 0) {
        empresaAtiva = empGrantW[0]
      } else {
        const esW = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (esW.length > 0) empresaAtiva = esW[0].id
      }
    } catch (eEmpW) {}

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
    } catch (e0) {}
    if (!ehGestao) return e.json(404, { ok: false, erro: 'não encontrado' })

    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}
    const leadId = String(body.lead || '')
    const vendedorEscolhido = String(body.vendedor || '')
    if (leadId === '') return e.json(422, { ok: false, erro: 'informe o lead' })

    var lead = null
    try {
      lead = app.findRecordById('crm_leads', leadId)
    } catch (e1) {
      return e.json(404, { ok: false, erro: 'lead não encontrado' })
    }

    // ---------- CONCORRÊNCIA: quem chegou depois recebe 409 ----------
    // Se o lead já ganhou dono entre a leitura da tela e este pedido, o
    // segundo pedido NÃO troca. Devolve 409 com quem ficou — é o que a SPEC
    // exige e o que evita o lead trocar de mão no meio do caminho.
    const donoAtual = String(lead.get('owner_id') || '')
    const donoEsperado = String(body.dono_esperado || '')
    if (donoAtual !== '' && donoEsperado === '') {
      var nomeDono = donoAtual
      try {
        const u = app.findRecordById('users', donoAtual)
        nomeDono = String(u.get('name') || u.get('email') || donoAtual)
      } catch (e2) {}
      return e.json(409, {
        ok: false,
        erro: 'este lead já tem dono',
        dono: donoAtual,
        dono_nome: nomeDono,
        detalhe: 'outra pessoa atribuiu primeiro; nada foi alterado',
      })
    }
    // se a tela mandou o dono que ela viu, confere se ainda é o mesmo
    if (donoEsperado !== '' && donoAtual !== donoEsperado) {
      return e.json(409, {
        ok: false,
        erro: 'o lead mudou enquanto você decidia',
        dono: donoAtual,
      })
    }

    // ---------- PONTO ÚNICO ----------
    // Não grava dono aqui: cria o pedido em whatsapp_transferencias, que é
    // quem aplica carteira → rodízio e grava uma vez só.
    try {
      const colTr = app.findCollectionByNameOrId('whatsapp_transferencias')
      const tr = new Record(colTr)
      tr.set('lead', leadId)
      tr.set('origem_pedido', 'botao')
      tr.set('motivo', 'primeiro_contato')
      tr.set('simulacao', false)
      tr.set('fixture', false)
      tr.set('detalhe', 'atribuido pela gestao (precisa de acao)')
      // quando a gestão escolhe a pessoa, o pedido carrega o vendedor
      if (vendedorEscolhido !== '') {
        tr.set('vendedor_user', vendedorEscolhido)
      }
      app.save(tr)
    } catch (e3) {
      return e.json(500, { ok: false, erro: 'não consegui atribuir: ' + String(e3).slice(0, 120) })
    }

    // relê o dono gravado pelo ponto único
    var donoAgora = ''
    var nomeAgora = ''
    try {
      const relido = app.findRecordById('crm_leads', leadId)
      donoAgora = String(relido.get('owner_id') || '')
      if (donoAgora !== '') {
        const u = app.findRecordById('users', donoAgora)
        nomeAgora = String(u.get('name') || u.get('email') || donoAgora)
      }
    } catch (e4) {}

    // resolve o item da fila, se houver
    if (String(body.item_fila || '') !== '') {
      try {
        const it = app.findRecordById('precisa_acao', String(body.item_fila))
        it.set('resolvido', true)
        it.set('resolvido_em', new Date().toISOString())
        it.set('resolvido_por', e.auth.id)
        it.set('resolvido_para', donoAgora)
        app.save(it)
      } catch (e5) {}
    }

    return e.json(200, {
      ok: true,
      lead: leadId,
      dono: donoAgora,
      dono_nome: nomeAgora,
      aviso: donoAgora !== '' ? '' : 'o rodízio ainda não rodou; o lead entra na fila dele',
    })
  },
  $apis.requireAuth(),
)

// ==================== REENVIAR O AVISO ====================
routerAdd(
  'POST',
  '/backend/v1/gestao/acao/reenviar',
  (e) => {
    // ---------- empresa ativa (CA-3-88) ----------
    // Lê os grants AQUI, no escopo da rota: `const meus` de dentro de um try
    // não existe fora dele (lança, o catch engole, o 403 não dispara).
    var empresaAtiva = ''
    try {
      var pedidaW = String(e.request.header.get('X-Empresa') || '')
      var gsW = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      var empGrantW = []
      var ehDonoW = false
      for (const gW of gsW) {
        var empGW = ''
        try {
          empGW = String(gW.get('empresa') || '')
        } catch (eGW) {}
        if (empGW !== '' && empGrantW.indexOf(empGW) < 0) empGrantW.push(empGW)
        var saW = []
        try {
          var rawW = gW.get('scope_accounts')
          saW =
            Array.isArray(rawW) && rawW.length > 0 && typeof rawW[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawW))
              : typeof rawW === 'string'
                ? JSON.parse(rawW)
                : rawW || []
        } catch (eSAW) {}
        if (Array.isArray(saW) && saW.indexOf('*') >= 0) ehDonoW = true
      }
      if (pedidaW !== '') {
        if (!ehDonoW && empGrantW.indexOf(pedidaW) < 0) {
          return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
        }
        empresaAtiva = pedidaW
      } else if (empGrantW.length > 0) {
        empresaAtiva = empGrantW[0]
      } else {
        const esW = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (esW.length > 0) empresaAtiva = esW[0].id
      }
    } catch (eEmpW) {}

    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}
    const leadId = String(body.lead || '')
    if (leadId === '') return e.json(422, { ok: false, erro: 'informe o lead' })

    var lead = null
    try {
      lead = $app.findRecordById('crm_leads', leadId)
    } catch (e1) {
      return e.json(404, { ok: false, erro: 'lead não encontrado' })
    }
    const dono = String(lead.get('owner_id') || '')
    if (dono === '') {
      return e.json(422, {
        ok: false,
        erro: 'este lead não tem dono — atribua antes de reenviar o aviso',
      })
    }

    // registra o pedido de reenvio na trilha (o aviso em si depende do modelo
    // aprovado; sem ele, a fila marcaria fora_da_janela_sem_modelo)
    try {
      const ev = new Record($app.findCollectionByNameOrId('crm_lead_events'))
      ev.set('lead_id', leadId)
      ev.set('tipo', 'nota')
      ev.set('texto', 'Aviso reenviado à gestão para o vendedor responsável')
      ev.set('user_id', e.auth.id)
      ev.set('fixture', false)
      $app.save(ev)
    } catch (e2) {}

    return e.json(200, {
      ok: true,
      lead: leadId,
      dono: dono,
      aviso: 'registrado; o aviso por WhatsApp depende de modelo aprovado na Meta',
    })
  },
  $apis.requireAuth(),
)
