/// <reference path="../pb_data/types.d.ts" />
/**
 * RESOLUÇÃO EM LOTE DOS REPETIDOS — versão rápida (09/11).
 *
 * **Por que reescrevi:** a versão anterior relia **59.070 contatos** a cada
 * chamada e levava ~2 minutos. Com 8.847 repetidos, isso obrigava dezenas de
 * lotes pequenos e travava no limite de execução.
 *
 * **O que mudou:** o primeiro passo **constrói um índice** dos telefones que
 * estão em mais de uma carteira e o guarda em `diag_cron_sonda` (coleção
 * técnica que já existe). Depois cada lote só lê a fatia que lhe cabe.
 *
 * **A regra é a mesma (CA-3-93):**
 *   1. **venda registrada** — quem fechou já tem relação;
 *   2. **último que conversou** — quem o cliente conhece;
 *   3. **menor carga** entre quem tem o contato.
 *   Nunca vai para quem não tinha o contato.
 *
 * Rotas:
 *   POST /backend/v1/carteira/repetidos/indice    → monta/atualiza o índice
 *   GET  /backend/v1/carteira/repetidos/estado    → quantos faltam
 *   POST /backend/v1/carteira/repetidos/lote      → processa N do índice
 */
routerAdd(
  'POST',
  '/backend/v1/carteira/repetidos/indice',
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

    // ---------- lê a carteira UMA vez ----------
    var cart = []
    try {
      cart = app.findRecordsByFilter(
        app.findCollectionByNameOrId('carteira_contatos'),
        '',
        '',
        120000,
        0,
      )
    } catch (e1) {
      return e.json(200, { ok: false, erro: 'não consegui ler a carteira' })
    }

    // telefone -> lista de vendedores
    const porTel = {}
    for (const c of cart) {
      const tel = String(c.get('telefone') || '').replace(/[^0-9]/g, '')
      const v = String(c.get('vendedor_user') || '')
      if (tel === '' || v === '') continue
      if (!porTel[tel]) porTel[tel] = {}
      porTel[tel][v] = true
    }
    const repetidos = []
    for (const t in porTel) {
      const vs = Object.keys(porTel[t])
      if (vs.length < 2) continue
      repetidos.push({ tel: t, vendedores: vs })
    }

    // ---------- guarda o índice ----------
    try {
      const colSonda = app.findCollectionByNameOrId('diag_cron_sonda')
      var registro = null
      try {
        const achados = app.findRecordsByFilter(colSonda, "job='indice_repetidos'", '', 1, 0)
        if (achados && achados.length > 0) registro = achados[0]
      } catch (eS1) {}
      if (!registro) {
        registro = new Record(colSonda)
        try {
          registro.set('job', 'indice_repetidos')
        } catch (eS2) {}
      }
      // formato compacto "tel:v1,v2|tel:v1,v2" — o JSON de objetos truncava
      // em 3 MB e o lote lia "índice ilegível".
      var linhasTxt = []
      for (const rr of repetidos) {
        linhasTxt.push(rr.tel + ':' + rr.vendedores.join(','))
      }
      try {
        registro.set('indice', linhasTxt.join('|'))
      } catch (eS3) {}
      app.save(registro)
    } catch (e2) {
      return e.json(200, {
        ok: false,
        erro: 'não consegui guardar o índice: ' + String(e2).slice(0, 140),
      })
    }

    return e.json(200, {
      ok: true,
      contatos: cart.length,
      repetidos: repetidos.length,
      aviso: 'índice montado; agora processe em lotes',
    })
  },
  $apis.requireAuth(),
)

// ==================== LOTE ====================
routerAdd(
  'POST',
  '/backend/v1/carteira/repetidos/lote',
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
    const inicio = Math.max(0, Number(body.inicio || 0))
    const tamanho = Math.min(Number(body.tamanho || 400), 800)

    const out = {
      ok: true,
      inicio: inicio,
      tamanho: tamanho,
      processados: 0,
      leads_movidos: 0,
      por_criterio: { venda: 0, ultima_conversa: 0, menor_carga: 0 },
      proximo: 0,
      terminou: false,
    }

    // ---------- lê o índice ----------
    var indice = []
    try {
      const achados = app.findRecordsByFilter(
        app.findCollectionByNameOrId('diag_cron_sonda'),
        "job='indice_repetidos'",
        '',
        1,
        0,
      )
      if (!achados || achados.length === 0) {
        return e.json(422, { ok: false, erro: 'monte o índice primeiro' })
      }
      const bruto = String(achados[0].get('indice') || '')
      if (bruto !== '') {
        for (const linha of bruto.split('|')) {
          const p2 = linha.indexOf(':')
          if (p2 < 1) continue
          const tel2 = linha.slice(0, p2)
          const vs2 = linha
            .slice(p2 + 1)
            .split(',')
            .filter(function (x) {
              return x !== ''
            })
          if (tel2 !== '' && vs2.length > 1) indice.push({ tel: tel2, vendedores: vs2 })
        }
      }
    } catch (e1) {
      return e.json(200, { ok: false, erro: 'índice ilegível: ' + String(e1).slice(0, 120) })
    }

    const fatia = indice.slice(inicio, inicio + tamanho)
    out.proximo = inicio + fatia.length
    out.terminou = out.proximo >= indice.length

    // ---------- apoio: venda e última conversa ----------
    // (uma leitura só; o volume é pequeno perto dos contatos)
    const vendaPorTel = {}
    const carga = {}
    try {
      for (const l of app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        12000,
        0,
      )) {
        const t = String(l.get('telefone') || '').replace(/[^0-9]/g, '')
        const dono = String(l.get('owner_id') || '')
        const st = String(l.get('status') || '')
        if (dono !== '') carga[dono] = (carga[dono] || 0) + 1
        if (t === '' || dono === '') continue
        if (!(Number(l.get('valor') || 0) > 0)) continue
        if (st !== 'venda_realizada' && st !== 'producao' && st !== 'finalizado') continue
        if (!vendaPorTel[t]) vendaPorTel[t] = dono
      }
    } catch (e2) {}

    const ultimaPorTel = {}
    try {
      const cxDoVend = {}
      for (const cx of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor'",
        '',
        50,
        0,
      )) {
        cxDoVend[cx.id] = String(cx.get('vendedor_user') || '')
      }
      for (const m of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        '',
        '',
        12000,
        0,
      )) {
        const t = String(m.get('contato_telefone') || '').replace(/[^0-9]/g, '')
        const v = cxDoVend[String(m.get('conexao') || '')] || ''
        if (t === '' || v === '') continue
        const q = new Date(String(m.get('enviada_em') || m.get('created') || '')).getTime()
        if (!(q > 0)) continue
        if (!ultimaPorTel[t] || q > ultimaPorTel[t].q) ultimaPorTel[t] = { vend: v, q: q }
      }
    } catch (e3) {}

    const colCart = app.findCollectionByNameOrId('carteira_contatos')
    const colL = app.findCollectionByNameOrId('crm_leads')
    const colEv = app.findCollectionByNameOrId('crm_lead_events')

    for (const item of fatia) {
      const tel = String(item.tel || '')
      const vendedores = item.vendedores || []
      if (tel === '' || vendedores.length < 2) continue
      out.processados++

      var escolhido = ''
      var criterio = ''

      const venda = vendaPorTel[tel] || ''
      if (venda !== '' && vendedores.indexOf(venda) >= 0) {
        escolhido = venda
        criterio = 'venda'
      }
      if (escolhido === '') {
        const u = ultimaPorTel[tel]
        if (u && vendedores.indexOf(u.vend) >= 0) {
          escolhido = u.vend
          criterio = 'ultima_conversa'
        }
      }
      if (escolhido === '') {
        var menor = ''
        var menorCarga = -1
        for (const v of vendedores) {
          const c = carga[v] || 0
          if (menor === '' || c < menorCarga) {
            menor = v
            menorCarga = c
          }
        }
        escolhido = menor
        criterio = 'menor_carga'
      }
      if (escolhido === '') continue
      out.por_criterio[criterio]++
      // a carga sobe a cada escolha: senão todos vão para o mesmo
      carga[escolhido] = (carga[escolhido] || 0) + 1

      // move o lead, se existir
      try {
        const ls = app.findRecordsByFilter(
          colL,
          "telefone='" + tel + "' && fixture=false",
          '',
          5,
          0,
        )
        for (const l of ls) {
          if (String(l.get('owner_id') || '') === escolhido) continue
          const antes = String(l.get('owner_id') || '')
          l.set('owner_id', escolhido)
          $app.save(l)
          out.leads_movidos++
          try {
            const ev = new Record(colEv)
            ev.set('lead_id', l.id)
            ev.set('tipo', 'status')
            ev.set('texto', 'Dono resolvido em lote por ' + criterio + ' (CA-3-93)')
            ev.set('user_id', e.auth.id)
            ev.set('fixture', false)
            $app.save(ev)
          } catch (e4) {}
        }
      } catch (e5) {}

      // tira o contato das carteiras dos outros
      try {
        const cs = app.findRecordsByFilter(colCart, "telefone='" + tel + "'", '', 20, 0)
        for (const c of cs) {
          if (String(c.get('vendedor_user') || '') === escolhido) continue
          try {
            app.delete(c)
          } catch (e6) {}
        }
      } catch (e7) {}
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)

// ==================== ESTADO ====================
routerAdd(
  'GET',
  '/backend/v1/carteira/repetidos/estado',
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

    if (!e.auth) return e.json(401, { ok: false })
    var total = 0
    try {
      const achados = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('diag_cron_sonda'),
        "job='indice_repetidos'",
        '',
        1,
        0,
      )
      if (achados && achados.length > 0) {
        const br = String(achados[0].get('indice') || '')
        total = br === '' ? 0 : br.split('|').length
      }
    } catch (e0) {}
    return e.json(200, { ok: true, repetidos_no_indice: total })
  },
  $apis.requireAuth(),
)
