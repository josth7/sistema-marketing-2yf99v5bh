/// <reference path="../pb_data/types.d.ts" />
/**
 * RESOLVER CONTATOS REPETIDOS EM LOTE — CA-3-93 (SPEC-3-013, 06/11).
 *
 * **O problema:** 10.537 telefones estão em mais de uma carteira. O mesmo
 * cliente aparece para duas ou três vendedoras e ninguém cobra — cada uma acha
 * que a outra atende.
 *
 * **A regra do consultor (substituiu o CA-3-75 de sugestão manual):**
 *
 * | Situação do repetido | Dono | Por quê |
 * |---|---|---|
 * | Tem conversa | **último vendedor que conversou** | é quem o cliente conhece |
 * | Sem conversa, com venda | **vendedor da venda** | dinheiro já entrou por ele |
 * | Sem conversa e sem venda | **menor carga** entre os que têm o contato | divide o trabalho |
 * | Nenhum dos critérios | **não mexe** | não inventa dono |
 *
 * **Ordem de precedência:** venda > conversa > menor carga. Isso porque quem
 * fechou a venda já tem relação comercial, e conversa é mais recente que carga.
 *
 * **Nunca vai para quem não tinha o contato.**
 *
 * Rotas:
 *   GET  /backend/v1/carteira/repetidos          → quantos e por critério
 *   POST /backend/v1/carteira/repetidos/resolver → aplica em lote
 */
routerAdd(
  'GET',
  '/backend/v1/carteira/repetidos',
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

    // ---------- telefone -> vendedores que o têm ----------
    const porTel = {}
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
      return e.json(200, { ok: false, erro: String(e1).slice(0, 140) })
    }
    for (const c of cart) {
      const tel = String(c.get('telefone') || '').replace(/\D/g, '')
      const v = String(c.get('vendedor_user') || '')
      if (tel === '' || v === '') continue
      if (!porTel[tel]) porTel[tel] = {}
      porTel[tel][v] = true
    }

    // ---------- quantos são repetidos ----------
    var repetidos = 0
    const listaTel = []
    for (const t in porTel) {
      if (Object.keys(porTel[t]).length < 2) continue
      repetidos++
      if (listaTel.length < 500) listaTel.push(t)
    }

    return e.json(200, {
      ok: true,
      total_contatos: cart.length,
      telefones_repetidos: repetidos,
      amostra: listaTel.slice(0, 10).length,
      criterios: {
        ordem: ['venda', 'ultima_conversa', 'menor_carga'],
        nunca: 'quem não tinha o contato',
      },
    })
  },
  $apis.requireAuth(),
)

// ==================== RESOLVER EM LOTE ====================
routerAdd(
  'POST',
  '/backend/v1/carteira/repetidos/resolver',
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
    const simular = body.simular !== false // PADRÃO: só simula
    const limite = Math.min(Number(body.limite || 500), 2000)

    const out = {
      ok: true,
      simulado: simular,
      repetidos: 0,
      processados: 0,
      por_criterio: { venda: 0, ultima_conversa: 0, menor_carga: 0, sem_criterio: 0 },
      movidos: 0,
      exemplos: [],
    }

    // ---------- dados de apoio ----------
    // telefone -> vendedores
    const porTel = {}
    var cart = []
    try {
      cart = app.findRecordsByFilter(
        app.findCollectionByNameOrId('carteira_contatos'),
        '',
        '',
        120000,
        0,
      )
    } catch (e1) {}
    for (const c of cart) {
      const tel = String(c.get('telefone') || '').replace(/\D/g, '')
      const v = String(c.get('vendedor_user') || '')
      if (tel === '' || v === '') continue
      if (!porTel[tel]) porTel[tel] = {}
      porTel[tel][v] = true
    }

    // última conversa por telefone e vendedor (quem falou por último)
    const ultimaPorTel = {}
    try {
      const msgs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        '',
        '',
        12000,
        0,
      )
      const cxDoVend = {}
      try {
        for (const cx of app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_conexoes'),
          "papel='vendedor'",
          '',
          50,
          0,
        )) {
          cxDoVend[cx.id] = String(cx.get('vendedor_user') || '')
        }
      } catch (eCx) {}
      for (const m of msgs) {
        const tel = String(m.get('contato_telefone') || '').replace(/\D/g, '')
        const vend = cxDoVend[String(m.get('conexao') || '')] || ''
        if (tel === '' || vend === '') continue
        const q = new Date(String(m.get('enviada_em') || m.get('created') || '')).getTime()
        if (!(q > 0)) continue
        if (!ultimaPorTel[tel] || q > ultimaPorTel[tel].q) {
          ultimaPorTel[tel] = { vend: vend, q: q }
        }
      }
    } catch (e2) {}

    // venda registrada por telefone
    const vendaPorTel = {}
    try {
      const leads = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        12000,
        0,
      )
      for (const l of leads) {
        const tel = String(l.get('telefone') || '').replace(/\D/g, '')
        const dono = String(l.get('owner_id') || '')
        const v = Number(l.get('valor') || 0)
        const st = String(l.get('status') || '')
        if (tel === '' || dono === '') continue
        if (!(v > 0)) continue
        if (st !== 'venda_realizada' && st !== 'producao' && st !== 'finalizado') continue
        if (!vendaPorTel[tel]) vendaPorTel[tel] = dono
      }
    } catch (e3) {}

    // carga atual por vendedor
    const carga = {}
    try {
      for (const l of app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        12000,
        0,
      )) {
        const d = String(l.get('owner_id') || '')
        if (d !== '') carga[d] = (carga[d] || 0) + 1
      }
    } catch (e4) {}

    // ---------- decide cada repetido ----------
    const colCart = app.findCollectionByNameOrId('carteira_contatos')
    const colEv = app.findCollectionByNameOrId('crm_lead_events')
    for (const tel in porTel) {
      const vendedores = Object.keys(porTel[tel])
      if (vendedores.length < 2) continue
      out.repetidos++
      if (out.processados >= limite) continue
      out.processados++

      var escolhido = ''
      var criterio = ''

      // 1. venda registrada — mas só se o vendedor da venda TEM o contato
      const vendVenda = vendaPorTel[tel] || ''
      if (vendVenda !== '' && vendedores.indexOf(vendVenda) >= 0) {
        escolhido = vendVenda
        criterio = 'venda'
      }
      // 2. último que conversou — também só entre quem tem
      if (escolhido === '') {
        const u = ultimaPorTel[tel]
        if (u && vendedores.indexOf(u.vend) >= 0) {
          escolhido = u.vend
          criterio = 'ultima_conversa'
        }
      }
      // 3. menor carga entre quem tem
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

      if (escolhido === '') {
        out.por_criterio.sem_criterio++
        continue
      }
      out.por_criterio[criterio]++

      if (out.exemplos.length < 10) {
        var nomeVend = escolhido
        try {
          const u = app.findRecordById('users', escolhido)
          nomeVend = String(u.get('name') || escolhido)
        } catch (e5) {}
        out.exemplos.push({
          telefone: tel,
          tinha: vendedores.length,
          escolhido: nomeVend,
          criterio: criterio,
        })
      }

      if (simular) continue

      // ---------- aplica: o lead vai para o escolhido; a carteira fica só com ele ----------
      try {
        const leadsDoTel = app.findRecordsByFilter(
          app.findCollectionByNameOrId('crm_leads'),
          "telefone='" + tel + "' && fixture=false",
          '',
          10,
          0,
        )
        for (const l of leadsDoTel) {
          const antes = String(l.get('owner_id') || '')
          if (antes === escolhido) continue
          l.set('owner_id', escolhido)
          $app.save(l)
          out.movidos++
          try {
            const ev = new Record(colEv)
            ev.set('lead_id', l.id)
            ev.set('tipo', 'status')
            ev.set(
              'texto',
              'Dono resolvido em lote por ' +
                criterio +
                ' (CA-3-93): ' +
                (nomesCurto(app, antes) || 'sem dono') +
                ' → ' +
                nomeVend,
            )
            ev.set('user_id', e.auth.id)
            ev.set('fixture', false)
            $app.save(ev)
          } catch (e6) {}
        }
        // remove o contato das carteiras dos outros
        const contatos = app.findRecordsByFilter(colCart, "telefone='" + tel + "'", '', 20, 0)
        for (const c of contatos) {
          const v = String(c.get('vendedor_user') || '')
          if (v === escolhido) continue
          try {
            app.delete(c)
          } catch (e7) {}
        }
      } catch (e8) {}
    }

    function nomesCurto(aplicacao, uid) {
      if (uid === '') return ''
      try {
        const u = aplicacao.findRecordById('users', uid)
        return String(u.get('name') || uid)
      } catch (e) {
        return uid
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
