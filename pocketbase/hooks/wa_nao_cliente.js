/// <reference path="../pb_data/types.d.ts" />
/**
 * "NÃO É CLIENTE" — CA-3-73 (SPEC-3-009, 05/11).
 *
 * Marcar uma conversa como "não é cliente" (transportadora, fornecedor, outra
 * empresa) faz quatro coisas:
 *   1. a conversa sai da aba **Clientes** e vai para **Outros**;
 *   2. nova mensagem desse telefone **não cria lead**;
 *   3. **não entra no rodízio** (ninguém recebe um "lead" que é transportadora);
 *   4. **o robô não responde** — não é atendimento comercial.
 *
 * "É cliente" desfaz tudo. Um telefone da equipe cadastrado continua aparecendo
 * em **Equipe**, que é classificação separada.
 *
 * Rota:
 *   POST /backend/v1/whatsapp/conversas/{id}/nao-cliente  { nao_cliente, motivo? }
 */
routerAdd(
  'POST',
  '/backend/v1/whatsapp/conversas/{id}/nao-cliente',
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

    // ---------- permissão: quem atende a conversa ou a gestão ----------
    var pode = false
    var temTudo = false
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
        const a = lerL(g.get('actions'))
        if (a.indexOf('read_conversas') >= 0) pode = true
        const sc = lerL(g.get('scope_accounts'))
        if (Array.isArray(sc) && sc.indexOf('*') >= 0) temTudo = true
      }
    } catch (e0) {}
    if (!pode) return e.json(403, { ok: false, erro: 'sem permissão para ver conversas' })

    var conv = null
    try {
      conv = app.findRecordById('whatsapp_conversas', String(e.request.pathValue('id') || ''))
    } catch (e1) {
      return e.json(404, { ok: false, erro: 'conversa não encontrada' })
    }

    // vendedor só marca conversa da própria carteira
    if (!temTudo) {
      var donoOk = false
      const leadId = String(conv.get('lead') || '')
      if (leadId !== '') {
        try {
          const l = app.findRecordById('crm_leads', leadId)
          if (String(l.get('owner_id') || '') === e.auth.id) donoOk = true
        } catch (e2) {}
      }
      if (!donoOk) {
        try {
          const cx = app.findRecordById('whatsapp_conexoes', String(conv.get('conexao') || ''))
          if (String(cx.get('vendedor_user') || '') === e.auth.id) donoOk = true
        } catch (e3) {}
      }
      if (!donoOk) return e.json(403, { ok: false, erro: 'esta conversa não é da sua carteira' })
    }

    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}
    const marcar = body.nao_cliente !== false // padrão: marcar
    const motivo = String(body.motivo || '')
      .trim()
      .slice(0, 80)

    try {
      conv.set('nao_cliente', marcar)
      conv.set('nao_cliente_motivo', marcar ? motivo : '')
      // Ao marcar, a conversa SAI da triagem para o robô não atendê-la.
      // O select `estado` só aceita: triagem, transferida, pausada_humano,
      // sem_ia. Usar um valor fora da lista faz o save ser RECUSADO em
      // silêncio (lição de 04/11) — por isso `sem_ia`, e a classificação real
      // fica no campo booleano `nao_cliente`.
      if (marcar) {
        conv.set('estado', 'sem_ia')
      } else if (String(conv.get('estado') || '') === 'sem_ia') {
        conv.set('estado', 'pausada_humano')
      }
      app.save(conv)
    } catch (e4) {
      return e.json(500, { ok: false, erro: 'não consegui salvar: ' + String(e4).slice(0, 140) })
    }

    // marca o lead também, para não entrar em rodízio nem contagem
    const leadId2 = String(conv.get('lead') || '')
    if (leadId2 !== '') {
      try {
        const l = app.findRecordById('crm_leads', leadId2)
        if (marcar) {
          l.set('status', 'descartado')
          l.set('motivo_perda', 'Não é cliente: ' + (motivo || 'classificado pela equipe'))
        } else {
          l.set('status', 'entrada_lead')
          l.set('motivo_perda', '')
        }
        app.save(l)
        try {
          const ev = new Record(app.findCollectionByNameOrId('crm_lead_events'))
          ev.set('lead_id', l.id)
          ev.set('tipo', 'status')
          ev.set(
            'texto',
            marcar
              ? 'Marcado como NÃO cliente (' + (motivo || 'sem rótulo') + ') — fora do rodízio'
              : 'Voltou a ser cliente',
          )
          ev.set('user_id', e.auth.id)
          ev.set('fixture', String(conv.get('fixture')) === 'true')
          app.save(ev)
        } catch (e5) {}
      } catch (e6) {}
    }

    return e.json(200, {
      ok: true,
      conversa: conv.id,
      nao_cliente: marcar,
      motivo: String(conv.get('nao_cliente_motivo') || ''),
      estado: String(conv.get('estado') || ''),
    })
  },
  $apis.requireAuth(),
)

// ==================== LISTA DE "OUTROS" ====================
routerAdd(
  'GET',
  '/backend/v1/whatsapp/outros',
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

    const out = { ok: true, total: 0, itens: [] }
    var convs = []
    try {
      convs = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_conversas'),
        'nao_cliente=true',
        '',
        500,
        0,
      )
    } catch (e0) {
      out.ok = false
      out.erro = String(e0).slice(0, 140)
      return e.json(200, out)
    }

    const nomesCx = {}
    try {
      for (const c of $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_conexoes'),
        '',
        '',
        50,
        0,
      )) {
        nomesCx[c.id] = String(c.get('nome_exibicao') || '')
      }
    } catch (e1) {}

    for (const c of convs) {
      out.itens.push({
        id: c.id,
        nome: String(c.get('contato_nome') || ''),
        telefone: String(c.get('contato_telefone') || ''),
        motivo: String(c.get('nao_cliente_motivo') || ''),
        numero: nomesCx[String(c.get('conexao') || '')] || '',
        ultima: String(c.get('ultima_mensagem_em') || '').slice(0, 16),
      })
    }
    out.itens.sort(function (a, b) {
      return String(b.ultima).localeCompare(String(a.ultima))
    })
    out.total = out.itens.length
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
