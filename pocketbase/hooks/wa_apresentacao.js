/// <reference path="../pb_data/types.d.ts" />
/**
 * APRESENTAÇÃO POR MODELO — opcional e DESLIGADA (CA-3-68, 05/11).
 *
 * **A regra (RN-137):** o aviso ao vendedor é em TEXTO pela central, e **só**
 * se a janela com ele estiver aberta. Nunca por modelo pago. A apresentação
 * por modelo, saindo do número do vendedor, é outra coisa: é opcional, custa
 * mensagem, e a gestão decide.
 *
 * **Decisão do dono:** desligada até a gestão autorizar na Administração.
 *
 * **O que vale enquanto estiver desligada (o padrão):**
 *   - NADA sai pelo número do vendedor;
 *   - nenhum envio com motivo `apresentacao_vendedor` é criado;
 *   - o cliente recebe o link e fala primeiro (RN-136).
 *
 * Rotas:
 *   GET  /backend/v1/atendimento/apresentacao   → situação de cada vendedor
 *   POST /backend/v1/atendimento/apresentacao   → {conexao, ativa, modelo?}
 *
 * Só a gestão liga ou desliga. Ligar exige modelo informado, senão o envio
 * ficaria em `aguardando_modelo` e ninguém entenderia por quê.
 */
routerAdd(
  'GET',
  '/backend/v1/atendimento/apresentacao',
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

    const hoje = new Date().toISOString().slice(0, 10)
    var pode = false
    try {
      const meus = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      for (const g of meus) {
        const ate = String(g.get('valid_until') || '')
        if (ate !== '' && ate.slice(0, 10) < hoje) continue
        const a = lerL(g.get('actions'))
        if (a.indexOf('manage_atendimento') >= 0 || a.indexOf('manage_whatsapp') >= 0) pode = true
      }
    } catch (e0) {}
    if (!pode) return e.json(403, { ok: false, erro: 'só a gestão' })

    const out = { ok: true, itens: [], algum_ligado: false, modelos_aprovados: [] }

    var cxs = []
    try {
      cxs = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor' && ativo=true",
        '',
        30,
        0,
      )
    } catch (e1) {
      out.ok = false
      out.erro = String(e1).slice(0, 140)
      return e.json(200, out)
    }

    // `segredo_configurado` NÃO é campo da coleção: é calculado na rota de
    // conexões comparando `nome_segredo_chave` com os segredos existentes.
    // Aqui se faz a mesma conta — antes o valor vinha sempre falso.
    var segredosExistentes = []
    try {
      segredosExistentes = $secrets.list
        ? $secrets.list().map(function (s) {
            return String(s.key || s.name || '')
          })
        : []
    } catch (eSec) {}
    if (segredosExistentes.length === 0) {
      // fallback: tenta ler o segredo que a conexão declara
      try {
        const teste = String($secrets.get('DAPI_KEY_CENTRAL') || '')
        if (teste !== '') segredosExistentes = ['DAPI_KEY_CENTRAL']
      } catch (eSec2) {}
    }

    for (const c of cxs) {
      // conta de teste não aparece na tela de gente real
      const nomeCx = String(c.get('nome_exibicao') || '')
      if (nomeCx.toLowerCase().indexOf('fixture') >= 0) continue
      const ativa = c.get('apresentacao_ativa') === true
      const chaveCx = String(c.get('nome_segredo_chave') || '')
      var temSegredo = segredosExistentes.indexOf(chaveCx) >= 0
      if (!temSegredo && chaveCx !== '') {
        try {
          temSegredo = String($secrets.get(chaveCx) || '') !== ''
        } catch (eSk) {}
      }
      if (ativa) out.algum_ligado = true
      out.itens.push({
        conexao: c.id,
        nome: String(c.get('nome_exibicao') || ''),
        numero: String(c.get('numero') || ''),
        ativa: ativa,
        modelo: String(c.get('modelo_apresentacao_vendedor') || ''),
        segredo_ok: temSegredo,
      })
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)

// ==================== LIGAR / DESLIGAR ====================
routerAdd(
  'POST',
  '/backend/v1/atendimento/apresentacao',
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

    const hoje = new Date().toISOString().slice(0, 10)
    var pode = false
    try {
      const meus = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      for (const g of meus) {
        const ate = String(g.get('valid_until') || '')
        if (ate !== '' && ate.slice(0, 10) < hoje) continue
        const a = lerA(g.get('actions'))
        if (a.indexOf('manage_atendimento') >= 0 || a.indexOf('manage_whatsapp') >= 0) pode = true
      }
    } catch (e0) {}
    if (!pode) return e.json(403, { ok: false, erro: 'só a gestão' })

    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}
    const conexaoId = String(body.conexao || '')
    const ativa = body.ativa === true
    const modelo = String(body.modelo || '')
      .trim()
      .slice(0, 120)

    if (conexaoId === '') return e.json(422, { ok: false, erro: 'informe a conexão' })

    var cx = null
    try {
      cx = $app.findRecordById('whatsapp_conexoes', conexaoId)
    } catch (e1) {
      return e.json(404, { ok: false, erro: 'conexão não encontrada' })
    }
    if (String(cx.get('papel') || '') !== 'vendedor') {
      return e.json(422, { ok: false, erro: 'a apresentação só vale para número de vendedor' })
    }

    // TRAVA: para LIGAR, precisa de modelo e de segredo próprio
    if (ativa) {
      if (modelo === '' && String(cx.get('modelo_apresentacao_vendedor') || '') === '') {
        return e.json(422, {
          ok: false,
          erro: 'informe o nome do modelo aprovado',
          detalhe:
            'sem modelo, o envio fica em "aguardando_modelo" e nada sai — a Meta não aceita texto livre fora da janela',
        })
      }
      // MESMA CONTA DO GET (correção 09/11).
      // `segredo_configurado` NÃO é campo de `whatsapp_conexoes` — é calculado
      // na rota de conexões. Ler o campo aqui devolvia SEMPRE falso e o POST
      // recusava todo número com 422 "sem chave própria" (5 recusas em 09/11
      // entre 8h24 e 8h25). A conta certa: o número tem chave quando o segredo
      // com o nome de `nome_segredo_chave` existe e não está vazio.
      const chaveDoNumero = String(cx.get('nome_segredo_chave') || '')
      var temChave = false
      if (chaveDoNumero !== '') {
        try {
          temChave = String($secrets.get(chaveDoNumero) || '') !== ''
        } catch (eSk) {}
      }
      if (!temChave) {
        return e.json(422, {
          ok: false,
          erro: 'este número não tem chave própria configurada',
          detalhe:
            'sem chave, o envio pelo número do vendedor não sai (RN-106). Chave esperada: ' +
            (chaveDoNumero !== '' ? chaveDoNumero : '(não definida na conexão)'),
        })
      }
    }

    try {
      cx.set('apresentacao_ativa', ativa)
      if (modelo !== '') cx.set('modelo_apresentacao_vendedor', modelo)
      $app.save(cx)
    } catch (e2) {
      return e.json(500, { ok: false, erro: 'não consegui salvar: ' + String(e2).slice(0, 140) })
    }

    // auditoria: ligar custa dinheiro, tem de ficar registrado quem ligou
    try {
      const a = new Record($app.findCollectionByNameOrId('access_audit'))
      a.set('at', new Date().toISOString())
      a.set('actor', e.auth.id)
      a.set('acao', ativa ? 'apresentacao_ligada' : 'apresentacao_desligada')
      a.set('alvo', conexaoId)
      a.set('detalhe', 'modelo=' + (modelo || String(cx.get('modelo_apresentacao_vendedor') || '')))
      $app.save(a)
    } catch (e3) {}

    return e.json(200, {
      ok: true,
      conexao: conexaoId,
      nome: String(cx.get('nome_exibicao') || ''),
      ativa: ativa,
      modelo: String(cx.get('modelo_apresentacao_vendedor') || ''),
    })
  },
  $apis.requireAuth(),
)
