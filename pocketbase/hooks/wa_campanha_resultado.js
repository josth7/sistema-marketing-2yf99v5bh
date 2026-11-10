/// <reference path="../pb_data/types.d.ts" />
/**
 * OPT-OUT E RESULTADO DA CAMPANHA — CA-3-86 (SPEC-3-016, 06/11).
 *
 * **Quem pede para sair nunca mais recebe.** Três formas valem, e uma NÃO vale:
 *   - texto igual a **sair, parar, pare, cancelar, remover, descadastrar**
 *     (minúsculas, sem acento, sem pontuação, sem espaço nas pontas);
 *   - o **botão de opt-out** do modelo (`template_button_reply`);
 *   - a recusa da Meta **131050** (cliente parou as mensagens de marketing);
 *   - **"sair por favor" NÃO vale** — é conversa, não pedido. A SPEC é explícita.
 *
 * **Resultado:** contagens por estado, as 5 principais recusas com código e as
 * saídas. É o que a gestão olha para saber se a campanha funcionou.
 *
 * **Pausa automática:** 10% ou mais de recusa nas últimas 50 → pausa e avisa.
 *
 * Rotas:
 *   POST /backend/v1/campanhas/{id}/resultado   → recalcula e devolve
 *   GET  /backend/v1/campanhas/{id}/resultado   → só lê
 *   POST /backend/v1/diag/testar-optout         → testa a detecção (prova)
 */
routerAdd(
  'POST',
  '/backend/v1/campanhas/{id}/resultado',
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
    if (!ehGestao) return e.json(403, { ok: false, erro: 'só a gestão vê o resultado' })

    var camp = null
    try {
      camp = app.findRecordById('campanhas', String(e.request.pathValue('id') || ''))
    } catch (e1) {
      return e.json(404, { ok: false, erro: 'campanha não encontrada' })
    }

    // ---------- contagens por estado dos destinos ----------
    var ds = []
    try {
      ds = app.findRecordsByFilter(
        app.findCollectionByNameOrId('campanha_destinos'),
        "campanha='" + camp.id + "'",
        '',
        20000,
        0,
      )
    } catch (e2) {}

    const porEstado = {}
    const saidas = []
    for (const d of ds) {
      const est = String(d.get('estado') || '(vazio)')
      porEstado[est] = (porEstado[est] || 0) + 1
      if (est === 'optout' && saidas.length < 50) {
        saidas.push(String(d.get('telefone') || ''))
      }
    }

    // ---------- recusas com código (últimos 50 envios da campanha) ----------
    var envs = []
    try {
      envs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        "conexao='" + String(camp.get('conexao') || '') + "' && motivo='campanha'",
        '',
        500,
        0,
      )
    } catch (e3) {}
    // ordena do mais novo para o mais antigo em JS (sort no filtro lança)
    envs.sort(function (a, b) {
      return String(b.get('created') || '').localeCompare(String(a.get('created') || ''))
    })

    const recusas = {}
    var falhas = 0
    const ultimos50 = envs.slice(0, 50)
    for (const en of ultimos50) {
      const erro = String(en.get('ultimo_erro') || '')
      const est = String(en.get('estado') || '')
      if (erro !== '' && est !== 'enviado') {
        // extrai o código (ex.: "meta: 131049 ...")
        var codigo = 'sem_codigo'
        const m = erro.match(/(\d{5,6})/)
        if (m) codigo = m[1]
        recusas[codigo] = (recusas[codigo] || 0) + 1
        falhas++
      } else if (est === 'erro' || est === 'erro_definitivo') {
        recusas['sem_codigo'] = (recusas['sem_codigo'] || 0) + 1
        falhas++
      }
    }

    const pares = []
    for (const k in recusas) pares.push({ codigo: k, vezes: recusas[k] })
    pares.sort(function (a, b) {
      return b.vezes - a.vezes
    })

    // ---------- pausa automática (10% nas últimas 50) ----------
    var pausou = false
    if (ultimos50.length >= 20 && falhas * 10 >= ultimos50.length) {
      const est = String(camp.get('estado') || '')
      if (est === 'em_andamento') {
        try {
          camp.set('estado', 'pausada')
          camp.set('pausada_em', new Date().toISOString())
          camp.set(
            'pausada_motivo',
            'pausa automatica: ' + falhas + ' de ' + ultimos50.length + ' envios com recusa',
          )
          app.save(camp)
          pausou = true
        } catch (e4) {}
      }
    }

    // ---------- custo estimado do que saiu ----------
    var preco = 0
    try {
      const vs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('admin_config'),
        '',
        '',
        200,
        0,
      )
      var cfg = null
      for (const v of vs) {
        if (!cfg || Number(v.get('versao') || 0) > Number(cfg.get('versao') || 0)) cfg = v
      }
      if (cfg) preco = Number(cfg.get('preco_marketing') || 0)
    } catch (e5) {}
    // "enviados" deve contar os ENVIOS da campanha (o que de fato saiu), não
    // os destinos. Antes dava 0 numa campanha que mandou 44 — a tela mentia.
    var enviados = Number(porEstado['enviado'] || 0)
    if (envs.length > 0) {
      enviados = 0
      for (const en of envs) {
        if (String(en.get('estado') || '') === 'enviado') enviados++
      }
    }
    const custo = preco * enviados

    return e.json(200, {
      ok: true,
      campanha: String(camp.get('nome') || ''),
      estado: String(camp.get('estado') || ''),
      total_destinos: ds.length,
      por_estado: porEstado,
      enviados: enviados,
      recusas: pares.slice(0, 5),
      total_recusas: falhas,
      ultimos_50: ultimos50.length,
      pausou_agora: pausou,
      saidas: saidas,
      total_saidas: porEstado['optout'] || 0,
      custo_centavos: custo,
      preco_unitario: preco,
    })
  },
  $apis.requireAuth(),
)

// ==================== TESTE DA DETECÇÃO DE OPT-OUT ====================
routerAdd(
  'POST',
  '/backend/v1/diag/testar-optout',
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

    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}
    const texto = String(body.texto || '')

    // mesma regra que o webhook usa
    function ehPedidoDeSaida(t) {
      const normal = String(t || '')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[.,!?;:]/g, '')
        .trim()
      const lista = ['sair', 'parar', 'pare', 'cancelar', 'remover', 'descadastrar']
      return lista.indexOf(normal) >= 0
    }

    return e.json(200, {
      ok: true,
      texto: texto,
      eh_pedido_de_saida: ehPedidoDeSaida(texto),
    })
  },
  $apis.requireAuth(),
)
