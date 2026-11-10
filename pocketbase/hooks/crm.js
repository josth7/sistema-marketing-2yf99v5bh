/// <reference path="../pb_data/types.d.ts" />
/**
 * CRM próprio (fase 4) — rotas de leads.
 *
 * Rotas (autenticadas — $apis.requireAuth()):
 *   GET  /backend/v1/crm/leads              → lista com escopo + filtros (read_leads)
 *   POST /backend/v1/crm/leads              → cria lead (manage_leads); 409 dedupe telefone
 *   PATCH /backend/v1/crm/leads/{id}        → status/observações/owner (manage_leads); evento na trilha
 *   GET  /backend/v1/crm/leads/{id}/eventos → trilha do lead (read_leads)
 *   POST /backend/v1/crm/leads/importar     → lote da planilha (manage_leads); dedupe; relatório
 *
 * Escopo: grant scope_accounts ('*' = tudo; vazio = negado — deny por padrão).
 * JSVM: TODA a lógica INLINE nos callbacks (pool de VM separado).
 */

// ==================== helpers de grant (inline em cada rota) ====================
// padrão: percorre grants válidos do usuário; devolve {temAcao, contas[], temTudo}

routerAdd(
  'GET',
  '/backend/v1/crm/leads',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    // ---------- empresa ativa (CA-3-88) ----------
    var empresaAtiva = ''
    try {
      var pedidaX = String(e.request.header.get('X-Empresa') || '')
      var gsX = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      var empGrantX = []
      var ehDonoX = false
      for (const gX of gsX) {
        var empGX = ''
        try {
          empGX = String(gX.get('empresa') || '')
        } catch (eGX) {}
        if (empGX !== '' && empGrantX.indexOf(empGX) < 0) empGrantX.push(empGX)
        var saX = []
        try {
          var rawX = gX.get('scope_accounts')
          saX =
            Array.isArray(rawX) && rawX.length > 0 && typeof rawX[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawX))
              : typeof rawX === 'string'
                ? JSON.parse(rawX)
                : rawX || []
        } catch (eSAX) {}
        if (Array.isArray(saX) && saX.indexOf('*') >= 0) ehDonoX = true
      }
      if (pedidaX !== '') {
        if (!ehDonoX && empGrantX.indexOf(pedidaX) < 0) {
          return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
        }
        empresaAtiva = pedidaX
      } else if (empGrantX.length > 0) {
        empresaAtiva = empGrantX[0]
      } else {
        const esX = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (esX.length > 0) empresaAtiva = esX[0].id
      }
    } catch (eEmpX) {}

    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      50,
      0,
    )
    var temRead = false
    var contas = []
    var temTudo = false
    // CA-3-88: empresa ativa. `X-Empresa` pedindo empresa sem grant -> 403.
    // Sem o header, usa a empresa do grant (ou a Haisan quando o grant é '*')
    var empresaAtiva = ''
    var empresasDoGrant = []
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
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
      if (acts.indexOf('read_leads') < 0) continue
      temRead = true
      // empresa do grant (campo criado na mig 0168)
      try {
        const empG = String(g.get('empresa') || '')
        if (empG !== '' && empresasDoGrant.indexOf(empG) < 0) empresasDoGrant.push(empG)
      } catch (eEmp) {}
      let sa = []
      try {
        const ra = g.get('scope_accounts')
        sa =
          Array.isArray(ra) && ra.length > 0 && typeof ra[0] === 'number'
            ? JSON.parse(String.fromCharCode.apply(null, ra))
            : typeof ra === 'string'
              ? JSON.parse(ra)
              : ra || []
      } catch (e3) {}
      if (!Array.isArray(sa)) sa = []
      // '*' = carteira inteira. Escopo VAZIO = só os leads do próprio usuário
      // (deny por padrão) — antes vazio virava "tudo", e o vendedor via os
      // 1.524 leads e as conversas dos outros (falha de privacidade 28/10).
      if (sa.indexOf('*') >= 0) temTudo = true
      for (const c of sa) if (c !== '*' && contas.indexOf(String(c)) < 0) contas.push(String(c))
    }
    if (!temRead) {
      return e.json(403, { ok: false, erro: 'sem permissão para ver leads (read_leads)' })
    }
    // ---------- empresa ativa (CA-3-88) ----------
    var pedidaEmp = ''
    try {
      pedidaEmp = String(e.request.header.get('X-Empresa') || '')
    } catch (ePe) {}
    if (pedidaEmp !== '') {
      // o dono (escopo '*') pode qualquer uma; os outros só a do grant
      if (!temTudo && empresasDoGrant.indexOf(pedidaEmp) < 0) {
        return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
      }
      empresaAtiva = pedidaEmp
    } else if (empresasDoGrant.length > 0) {
      empresaAtiva = empresasDoGrant[0]
    } else {
      // sem empresa no grant: usa a Haisan (única hoje)
      try {
        const es = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (es.length > 0) empresaAtiva = es[0].id
      } catch (eEm) {}
    }

    const colL = $app.findCollectionByNameOrId('crm_leads')
    // fixture separado: usuários reais não veem fixture e vice-versa
    const ehFixture = String(e.auth.email || '').indexOf('.fixture.') >= 0
    // teto alto: a base da agência trouxe 1.518 leads (28/10). O teto antigo
    // de 500 fazia a tela mostrar só um terço da base.
    // sort VAZIO: findRecordsByFilter com sort lança 400 no JSVM (lição 22/10)
    // filtro por empresa ATIVA (CA-3-88): sem isto, a segunda empresa veria
    // os leads da Haisan
    const filtroEmpresa = empresaAtiva !== '' ? " && empresa='" + empresaAtiva + "'" : ''
    const registros = $app.findRecordsByFilter(
      colL,
      'fixture=' + (ehFixture ? 'true' : 'false') + filtroEmpresa,
      '',
      5000,
      0,
    )
    // mapa de nomes de usuário (1 consulta em vez de N)
    const mapaUsuarios = {}
    try {
      const colU = $app.findCollectionByNameOrId('users')
      const usuarios = $app.findRecordsByFilter(colU, '', '', 200, 0)
      for (const u of usuarios) {
        mapaUsuarios[u.id] = String(u.get('name') || u.get('email') || '')
      }
    } catch (eU) {}

    const itens = []
    for (const l of registros) {
      if (!temTudo) {
        // vendedor: só o que é dele
        const dono = String(l.get('owner_id') || '')
        if (dono !== e.auth.id) continue
        // e, se houver escopo de conta, o lead tem de ser de uma delas
        if (contas.length > 0) {
          const conta = String(l.get('conta_id') || '')
          var dentro = false
          for (const c of contas) {
            if (conta !== '' && conta.indexOf(c) >= 0) dentro = true
          }
          if (!dentro) continue
        }
      }
      var criadoEm = ''
      try {
        criadoEm = String(l.get('created') || '')
      } catch (eC1) {}
      var atualizadoEm = ''
      try {
        atualizadoEm = String(l.get('updated') || '')
      } catch (eC2) {}
      // nome do responsável — sai do mapa carregado uma vez por requisição
      // (antes era findRecordById por lead: ~1.5 mil consultas só para montar
      // a lista, o que dominava o tempo de resposta com a base da agência)
      const owId = String(l.get('owner_id') || '')
      var ownerNome = ''
      if (owId !== '') ownerNome = mapaUsuarios[owId] || ''
      // temperatura do lead (neutro/positivo/frio — padrão do CRM atual):
      // orçamento ou fechado = positivo; perdido = frio; resto = neutro
      var temperatura = 'neutro'
      const stTmp = String(l.get('status') || 'entrada_lead')
      if (
        stTmp === 'orcamento' ||
        stTmp === 'negociacao' ||
        stTmp === 'aguardando_pagamento' ||
        stTmp === 'venda_realizada' ||
        stTmp === 'producao' ||
        stTmp === 'finalizado'
      )
        temperatura = 'positivo'
      else if (stTmp === 'descartado') temperatura = 'frio'
      itens.push({
        id: l.id,
        nome: l.get('nome'),
        telefone: l.get('telefone'),
        email: l.get('email'),
        origem: l.get('origem'),
        campanha: l.get('campanha'),
        data_lead: l.get('data_lead'),
        status: l.get('status') || 'entrada_lead',
        observacoes: l.get('observacoes'),
        owner_id: l.get('owner_id'),
        owner_nome: ownerNome,
        temperatura: temperatura,
        conta_id: l.get('conta_id'),
        criado_em: criadoEm,
        atualizado_em: atualizadoEm,
        valor: l.get('valor'),
        vendedor_nome: l.get('vendedor_nome'),
        etapa_origem: l.get('etapa_origem'),
        tags_origem: l.get('tags_origem'),
        entrada_whatsapp: l.get('entrada_whatsapp'),
        canal_atendimento: l.get('canal_atendimento'),
        ia_nota: l.get('ia_nota'),
        ia_humor: l.get('ia_humor'),
        // IA do lead (CA-3-23): a tela precisa do resumo e da justificativa
        // para o vendedor decidir sem abrir a conversa inteira
        ia_resumo: l.get('ia_resumo'),
        ia_justificativa: l.get('ia_justificativa'),
        ia_humor_score: l.get('ia_humor_score'),
        ia_calculado_em: l.get('ia_calculado_em'),
      })
    }
    return e.json(200, { ok: true, total: itens.length, itens: itens })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/crm/leads',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    // ---------- empresa ativa (CA-3-88) ----------
    var empresaAtiva = ''
    try {
      var pedidaX = String(e.request.header.get('X-Empresa') || '')
      var gsX = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      var empGrantX = []
      var ehDonoX = false
      for (const gX of gsX) {
        var empGX = ''
        try {
          empGX = String(gX.get('empresa') || '')
        } catch (eGX) {}
        if (empGX !== '' && empGrantX.indexOf(empGX) < 0) empGrantX.push(empGX)
        var saX = []
        try {
          var rawX = gX.get('scope_accounts')
          saX =
            Array.isArray(rawX) && rawX.length > 0 && typeof rawX[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawX))
              : typeof rawX === 'string'
                ? JSON.parse(rawX)
                : rawX || []
        } catch (eSAX) {}
        if (Array.isArray(saX) && saX.indexOf('*') >= 0) ehDonoX = true
      }
      if (pedidaX !== '') {
        if (!ehDonoX && empGrantX.indexOf(pedidaX) < 0) {
          return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
        }
        empresaAtiva = pedidaX
      } else if (empGrantX.length > 0) {
        empresaAtiva = empGrantX[0]
      } else {
        const esX = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (esX.length > 0) empresaAtiva = esX[0].id
      }
    } catch (eEmpX) {}

    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      50,
      0,
    )
    var temManage = false
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
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
      if (acts.indexOf('manage_leads') >= 0) temManage = true
    }
    if (!temManage) {
      return e.json(403, { ok: false, erro: 'sem permissão para gerir leads (manage_leads)' })
    }
    const body = e.requestInfo().body || {}
    const nome = String(body.nome || '').trim()
    if (nome === '') {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { nome: 'informe o nome' },
      })
    }
    const telefone = String(body.telefone || '').trim()
    const email = String(body.email || '').trim()
    const ORIGENS = ['meta', 'google', 'site', 'whatsapp', 'manual', 'importacao', 'organico']
    const STATUSES = [
      'entrada_lead',
      'pre_atendimento_ia',
      'mql',
      'orcamento',
      'negociacao',
      'aguardando_pagamento',
      'venda_realizada',
      'producao',
      'finalizado',
      'descartado',
    ]
    const origem =
      ORIGENS.indexOf(String(body.origem || 'manual')) >= 0
        ? String(body.origem || 'manual')
        : 'manual'
    const status =
      STATUSES.indexOf(String(body.status || 'entrada_lead')) >= 0
        ? String(body.status || 'entrada_lead')
        : 'entrada_lead'
    // dedupe por telefone (UNIQUE parcial no banco; erro amigável aqui)
    const colL = $app.findCollectionByNameOrId('crm_leads')
    if (telefone !== '') {
      const dup = $app.findRecordsByFilter(
        colL,
        "telefone='" + telefone.replace(/'/g, '') + "'",
        '',
        1,
        0,
      )
      if (dup && dup.length > 0) {
        return e.json(409, {
          ok: false,
          erro: 'lead duplicado',
          detalhe: 'já existe um lead com este telefone (id ' + dup[0].id + ')',
        })
      }
    }
    const ehFixture = String(e.auth.email || '').indexOf('.fixture.') >= 0
    const rec = new Record(colL)
    rec.set('nome', nome.slice(0, 200))
    rec.set('telefone', telefone.slice(0, 40))
    rec.set('email', email)
    rec.set('origem', origem)
    rec.set(
      'campanha',
      String(body.campanha || '')
        .trim()
        .slice(0, 200),
    )
    if (body.data_lead) {
      try {
        rec.set('data_lead', String(body.data_lead))
      } catch (eD) {}
    }
    rec.set('status', status)
    rec.set(
      'observacoes',
      String(body.observacoes || '')
        .trim()
        .slice(0, 2000),
    )
    rec.set('owner_id', String(body.owner_id || e.auth.id))
    rec.set('conta_id', String(body.conta_id || 'haisan'))
    rec.set('fixture', ehFixture)
    try {
      $app.save(rec)
    } catch (eSaveSolto) {
      console.log('save falhou em crm.js: ' + String(eSaveSolto).slice(0, 160))
    }
    // evento de criação na trilha
    const colEv = $app.findCollectionByNameOrId('crm_lead_events')
    const ev = new Record(colEv)
    ev.set('lead_id', rec.id)
    ev.set('tipo', 'criado')
    ev.set(
      'texto',
      'Lead criado (' + origem + (body.campanha ? ' · ' + String(body.campanha) : '') + ')',
    )
    ev.set('user_id', e.auth.id)
    ev.set('fixture', ehFixture)
    try {
      $app.save(ev)
    } catch (eSaveSolto) {
      console.log('save falhou em crm.js: ' + String(eSaveSolto).slice(0, 160))
    }
    return e.json(201, { ok: true, id: rec.id, status: status })
  },
  $apis.requireAuth(),
)

routerAdd(
  'PATCH',
  '/backend/v1/crm/leads/{id}',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    // ---------- empresa ativa (CA-3-88) ----------
    var empresaAtiva = ''
    try {
      var pedidaX = String(e.request.header.get('X-Empresa') || '')
      var gsX = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      var empGrantX = []
      var ehDonoX = false
      for (const gX of gsX) {
        var empGX = ''
        try {
          empGX = String(gX.get('empresa') || '')
        } catch (eGX) {}
        if (empGX !== '' && empGrantX.indexOf(empGX) < 0) empGrantX.push(empGX)
        var saX = []
        try {
          var rawX = gX.get('scope_accounts')
          saX =
            Array.isArray(rawX) && rawX.length > 0 && typeof rawX[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawX))
              : typeof rawX === 'string'
                ? JSON.parse(rawX)
                : rawX || []
        } catch (eSAX) {}
        if (Array.isArray(saX) && saX.indexOf('*') >= 0) ehDonoX = true
      }
      if (pedidaX !== '') {
        if (!ehDonoX && empGrantX.indexOf(pedidaX) < 0) {
          return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
        }
        empresaAtiva = pedidaX
      } else if (empGrantX.length > 0) {
        empresaAtiva = empGrantX[0]
      } else {
        const esX = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (esX.length > 0) empresaAtiva = esX[0].id
      }
    } catch (eEmpX) {}

    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      50,
      0,
    )
    var temManage = false
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
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
      if (acts.indexOf('manage_leads') >= 0) temManage = true
      // CA-3-62 (06/11): o VENDEDOR move a etapa do PRÓPRIO lead. Antes o
      // PATCH exigia manage_leads e a vendedora não conseguia arrastar nada —
      // o funil era só da gestão. O escopo abaixo garante que ela só mexe no
      // que é dela; trocar dono continua sendo só da gestão.
      if (acts.indexOf('read_leads') >= 0) temManage = true
    }
    if (!temManage) {
      return e.json(403, { ok: false, erro: 'sem permissão para ver leads (read_leads)' })
    }
    let lead
    try {
      lead = $app.findRecordById('crm_leads', e.request.pathValue('id'))
    } catch (_) {
      return e.json(404, { ok: false, erro: 'lead não encontrado' })
    }
    // CA-3-37 (06/11): escopo do cargo ANTES de devolver o lead. A lista já
    // filtrava, mas ficha/trilha/conversão aceitavam qualquer id — bastava
    // saber o id para ler o cliente de outro vendedor. Gestão (escopo '*') vê
    // tudo; vendedor só o lead dele. Decisão do dono: a exceção da central
    // continua — o lead dele vale em qualquer conexão.
    var podeLead = false
    try {
      const hojeE = new Date().toISOString().slice(0, 10)
      const gsE = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '-created',
        60,
        0,
      )
      for (const gE of gsE) {
        const deE = String(gE.get('valid_from') || '')
        const ateE = String(gE.get('valid_until') || '')
        if (deE !== '' && deE.slice(0, 10) > hojeE) continue
        if (ateE !== '' && ateE.slice(0, 10) < hojeE) continue
        var escE = []
        try {
          const rawE = gE.get('scope_accounts')
          escE =
            Array.isArray(rawE) && rawE.length > 0 && typeof rawE[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawE))
              : typeof rawE === 'string'
                ? JSON.parse(rawE)
                : rawE || []
        } catch (eEE) {}
        if (Array.isArray(escE) && escE.indexOf('*') >= 0) podeLead = true
      }
      if (!podeLead && String(lead.get('owner_id') || '') === e.auth.id) podeLead = true
    } catch (eEs) {}
    if (!podeLead) return e.json(404, { ok: false, erro: 'lead não encontrado' })

    const body = e.requestInfo().body || {}
    const STATUSES = [
      'entrada_lead',
      'pre_atendimento_ia',
      'mql',
      'orcamento',
      'negociacao',
      'aguardando_pagamento',
      'venda_realizada',
      'producao',
      'finalizado',
      'descartado',
    ]
    const mudancas = []
    if (body.status !== undefined) {
      const novo = String(body.status || '')
      if (STATUSES.indexOf(novo) < 0) {
        return e.json(422, {
          ok: false,
          erro: 'entrada inválida',
          campos: { status: 'use novo, em_contato, orcamento, fechado ou perdido' },
        })
      }
      const antigo = String(lead.get('status') || 'novo')
      if (novo !== antigo) {
        lead.set('status', novo)
        // CA-3-63 (06/11): MUDANÇA MANUAL TRAVA A ETAPA. A partir daqui o robô
        // e a IA não alteram mais a etapa deste lead — decisão humana vale mais
        // que automação. Sem esta marca, o cron do roteiro desfazia a mudança
        // no minuto seguinte e o vendedor perdia a confiança no funil.
        try {
          lead.set('etapa_manual_em', new Date().toISOString())
          lead.set('etapa_manual_por', e.auth.id)
        } catch (eMarca) {}
        mudancas.push({
          tipo: 'status',
          texto:
            'status: ' + antigo + ' → ' + novo + ' (mudança manual; etapa travada para o robô)',
        })
      }
    }
    if (body.observacoes !== undefined) {
      lead.set(
        'observacoes',
        String(body.observacoes || '')
          .trim()
          .slice(0, 2000),
      )
      mudancas.push({ tipo: 'nota', texto: 'observações atualizadas' })
    }
    if (body.owner_id !== undefined) {
      // CA-3-62 (06/11): vendedor NÃO troca o dono do lead. Só a gestão passa
      // carteira (pela tela de gestão, pelo ponto único). Antes o PATCH aceitava
      // e o vendedor podia puxar para si o cliente de outro.
      var ehGestaoOwner = false
      try {
        const hojeO = new Date().toISOString().slice(0, 10)
        const gsO = $app.findRecordsByFilter(
          $app.findCollectionByNameOrId('access_grants'),
          "user_id='" + e.auth.id + "' && revoked_at=''",
          '',
          60,
          0,
        )
        for (const gO of gsO) {
          const deO = String(gO.get('valid_from') || '')
          const ateO = String(gO.get('valid_until') || '')
          if (deO !== '' && deO.slice(0, 10) > hojeO) continue
          if (ateO !== '' && ateO.slice(0, 10) < hojeO) continue
          var scO = []
          try {
            const rawO = gO.get('scope_accounts')
            scO =
              Array.isArray(rawO) && rawO.length > 0 && typeof rawO[0] === 'number'
                ? JSON.parse(String.fromCharCode.apply(null, rawO))
                : typeof rawO === 'string'
                  ? JSON.parse(rawO)
                  : rawO || []
          } catch (eO) {}
          if (Array.isArray(scO) && scO.indexOf('*') >= 0) ehGestaoOwner = true
        }
      } catch (eGO) {}
      if (!ehGestaoOwner) {
        return e.json(403, {
          ok: false,
          erro: 'campo_nao_permitido',
          campo: 'owner_id',
          detalhe: 'o dono do lead só muda pela gestão',
        })
      }
      lead.set('owner_id', String(body.owner_id || '').slice(0, 40))
      mudancas.push({ tipo: 'nota', texto: 'responsável atualizado' })
    }
    if (body.valor !== undefined) {
      const vv = Number(body.valor)
      if (!Number.isFinite(vv) || vv < 0) {
        return e.json(422, {
          ok: false,
          erro: 'entrada inválida',
          campos: { valor: 'valor inválido' },
        })
      }
      lead.set('valor', vv)
      mudancas.push({ tipo: 'nota', texto: 'valor da venda: R$ ' + vv.toFixed(2) })
    }
    if (body.motivo_perda !== undefined) {
      lead.set(
        'motivo_perda',
        String(body.motivo_perda || '')
          .trim()
          .slice(0, 300),
      )
      mudancas.push({ tipo: 'nota', texto: 'motivo da perda registrado' })
    }
    if (body.proximo_contato_em !== undefined) {
      if (String(body.proximo_contato_em || '').trim() !== '') {
        try {
          lead.set('proximo_contato_em', String(body.proximo_contato_em))
          mudancas.push({
            tipo: 'nota',
            texto: 'próximo contato agendado para ' + String(body.proximo_contato_em).slice(0, 10),
          })
        } catch (ePc) {}
      }
    }
    // status=perdido exige motivo (PDF da Anezia §8: motivos de perda no painel)
    if (body.status === 'descartado' && String(body.motivo_perda || '').trim() === '') {
      const motivoAtual = String(lead.get('motivo_perda') || '')
      if (motivoAtual === '') {
        return e.json(422, {
          ok: false,
          erro: 'entrada inválida',
          campos: { motivo_perda: 'informe o motivo da perda' },
        })
      }
    }
    if (mudancas.length === 0) {
      return e.json(200, { ok: true, id: lead.id, sem_mudanca: true })
    }
    try {
      $app.save(lead)
    } catch (eSaveSolto) {
      console.log('save falhou em crm.js: ' + String(eSaveSolto).slice(0, 160))
    }
    const colEv = $app.findCollectionByNameOrId('crm_lead_events')
    const ehFixture = String(lead.get('fixture')) === 'true'
    for (const m of mudancas) {
      const ev = new Record(colEv)
      ev.set('lead_id', lead.id)
      ev.set('tipo', m.tipo)
      ev.set('texto', m.texto)
      ev.set('user_id', e.auth.id)
      ev.set('fixture', ehFixture)
      try {
        $app.save(ev)
      } catch (eSaveSolto) {
        console.log('save falhou em crm.js: ' + String(eSaveSolto).slice(0, 160))
      }
    }
    return e.json(200, { ok: true, id: lead.id, mudancas: mudancas.length })
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/crm/leads/{id}/eventos',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    // ---------- empresa ativa (CA-3-88) ----------
    var empresaAtiva = ''
    try {
      var pedidaX = String(e.request.header.get('X-Empresa') || '')
      var gsX = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      var empGrantX = []
      var ehDonoX = false
      for (const gX of gsX) {
        var empGX = ''
        try {
          empGX = String(gX.get('empresa') || '')
        } catch (eGX) {}
        if (empGX !== '' && empGrantX.indexOf(empGX) < 0) empGrantX.push(empGX)
        var saX = []
        try {
          var rawX = gX.get('scope_accounts')
          saX =
            Array.isArray(rawX) && rawX.length > 0 && typeof rawX[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawX))
              : typeof rawX === 'string'
                ? JSON.parse(rawX)
                : rawX || []
        } catch (eSAX) {}
        if (Array.isArray(saX) && saX.indexOf('*') >= 0) ehDonoX = true
      }
      if (pedidaX !== '') {
        if (!ehDonoX && empGrantX.indexOf(pedidaX) < 0) {
          return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
        }
        empresaAtiva = pedidaX
      } else if (empGrantX.length > 0) {
        empresaAtiva = empGrantX[0]
      } else {
        const esX = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (esX.length > 0) empresaAtiva = esX[0].id
      }
    } catch (eEmpX) {}

    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      50,
      0,
    )
    var temRead = false
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
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
      if (acts.indexOf('read_leads') >= 0) temRead = true
    }
    if (!temRead) {
      return e.json(403, { ok: false, erro: 'sem permissão para ver leads (read_leads)' })
    }
    var leadEv = null
    try {
      leadEv = $app.findRecordById('crm_leads', e.request.pathValue('id'))
    } catch (_) {
      return e.json(404, { ok: false, erro: 'lead não encontrado' })
    }
    // CA-3-37 (06/11): escopo do cargo — vendedor só vê a trilha do próprio lead.
    var podeTrilha = false
    try {
      const hojeT = new Date().toISOString().slice(0, 10)
      const gsT = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '-created',
        60,
        0,
      )
      for (const gT of gsT) {
        const deT = String(gT.get('valid_from') || '')
        const ateT = String(gT.get('valid_until') || '')
        if (deT !== '' && deT.slice(0, 10) > hojeT) continue
        if (ateT !== '' && ateT.slice(0, 10) < hojeT) continue
        var escT = []
        try {
          const rawT = gT.get('scope_accounts')
          escT =
            Array.isArray(rawT) && rawT.length > 0 && typeof rawT[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawT))
              : typeof rawT === 'string'
                ? JSON.parse(rawT)
                : rawT || []
        } catch (eET) {}
        if (Array.isArray(escT) && escT.indexOf('*') >= 0) podeTrilha = true
      }
      if (!podeTrilha && String(leadEv.get('owner_id') || '') === e.auth.id) podeTrilha = true
    } catch (eEsT) {}
    if (!podeTrilha) return e.json(404, { ok: false, erro: 'lead não encontrado' })

    const colEv = $app.findCollectionByNameOrId('crm_lead_events')
    const evs = $app.findRecordsByFilter(
      colEv,
      "lead_id='" + e.request.pathValue('id') + "'",
      '',
      200,
      0,
    )
    const itens = []
    for (const ev of evs) {
      var evCriado = ''
      try {
        evCriado = String(ev.get('created') || '')
      } catch (eC3) {}
      itens.push({
        id: ev.id,
        tipo: ev.get('tipo'),
        texto: ev.get('texto'),
        user_id: ev.get('user_id'),
        criado_em: evCriado,
      })
    }
    return e.json(200, { ok: true, total: itens.length, itens: itens })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/crm/leads/{id}/conversao',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    // ---------- empresa ativa (CA-3-88) ----------
    var empresaAtiva = ''
    try {
      var pedidaX = String(e.request.header.get('X-Empresa') || '')
      var gsX = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      var empGrantX = []
      var ehDonoX = false
      for (const gX of gsX) {
        var empGX = ''
        try {
          empGX = String(gX.get('empresa') || '')
        } catch (eGX) {}
        if (empGX !== '' && empGrantX.indexOf(empGX) < 0) empGrantX.push(empGX)
        var saX = []
        try {
          var rawX = gX.get('scope_accounts')
          saX =
            Array.isArray(rawX) && rawX.length > 0 && typeof rawX[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawX))
              : typeof rawX === 'string'
                ? JSON.parse(rawX)
                : rawX || []
        } catch (eSAX) {}
        if (Array.isArray(saX) && saX.indexOf('*') >= 0) ehDonoX = true
      }
      if (pedidaX !== '') {
        if (!ehDonoX && empGrantX.indexOf(pedidaX) < 0) {
          return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
        }
        empresaAtiva = pedidaX
      } else if (empGrantX.length > 0) {
        empresaAtiva = empGrantX[0]
      } else {
        const esX = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (esX.length > 0) empresaAtiva = esX[0].id
      }
    } catch (eEmpX) {}

    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      50,
      0,
    )
    var temManage = false
    var temLeituraConv = false
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
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
      // RN-196 (10/11): o vendedor registra a conversão de um lead DELE.
      // Antes só manage_leads passava, e o vendedor só tem read_leads — dava
      // 403 numa venda da própria carteira (relato da Anézia).
      if (acts.indexOf('manage_leads') >= 0) temManage = true
      if (acts.indexOf('read_leads') >= 0) temLeituraConv = true
    }
    if (!temManage && !temLeituraConv) {
      return e.json(403, { ok: false, erro: 'sem permissão para registrar conversão' })
    }
    let lead
    try {
      lead = $app.findRecordById('crm_leads', e.request.pathValue('id'))
    } catch (_) {
      return e.json(404, { ok: false, erro: 'lead não encontrado' })
    } // CA-3-37 (06/11): escopo do cargo — vendedor só o próprio lead.
    var podeLead2 = false
    try {
      const hojeE2 = new Date().toISOString().slice(0, 10)
      const gsE2 = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '-created',
        60,
        0,
      )
      for (const gE2 of gsE2) {
        const deE2 = String(gE2.get('valid_from') || '')
        const ateE2 = String(gE2.get('valid_until') || '')
        if (deE2 !== '' && deE2.slice(0, 10) > hojeE2) continue
        if (ateE2 !== '' && ateE2.slice(0, 10) < hojeE2) continue
        var escE2 = []
        try {
          const rawE2 = gE2.get('scope_accounts')
          escE2 =
            Array.isArray(rawE2) && rawE2.length > 0 && typeof rawE2[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawE2))
              : typeof rawE2 === 'string'
                ? JSON.parse(rawE2)
                : rawE2 || []
        } catch (eEE2) {}
        if (Array.isArray(escE2) && escE2.indexOf('*') >= 0) podeLead2 = true
      }
      if (!podeLead2 && String(lead.get('owner_id') || '') === e.auth.id) podeLead2 = true
    } catch (eEs2) {}
    if (!podeLead2) return e.json(404, { ok: false, erro: 'lead não encontrado' })

    const body = e.requestInfo().body || {}
    const valor = Number(body.valor)
    if (!Number.isFinite(valor) || valor <= 0) {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { valor: 'informe o valor da venda (maior que zero)' },
      })
    }
    const descricao = String(body.descricao || '')
      .trim()
      .slice(0, 500)
    const canal = String(body.canal || 'whatsapp')
    const CANAIS = ['whatsapp', 'site', 'telefone', 'presencial']
    const canalOk = CANAIS.indexOf(canal) >= 0 ? canal : 'whatsapp'
    const ehFixture = String(lead.get('fixture')) === 'true'
    // VALOR NO LEAD (correção 04/11). Antes esta rota gravava o valor só na
    // conversão (fila do Meta/Google) e NUNCA no lead: o lead ficava em
    // "venda realizada" com valor ZERO. Foi assim que 18 vendas importadas
    // da planilha da agência nasceram sem valor e a taxa de conversão virou
    // ficção. O valor é a fonte de verdade do faturamento no CRM.
    lead.set('valor', valor)
    // grava a conversão na trilha
    const colEv = $app.findCollectionByNameOrId('crm_lead_events')
    const ev = new Record(colEv)
    ev.set('lead_id', lead.id)
    ev.set('tipo', 'conversao')
    ev.set(
      'texto',
      'CONVERSÃO (' + canalOk + '): R$ ' + valor.toFixed(2) + (descricao ? ' — ' + descricao : ''),
    )
    ev.set('user_id', e.auth.id)
    ev.set('fixture', ehFixture)
    try {
      $app.save(ev)
    } catch (eSaveSolto) {
      console.log('save falhou em crm.js: ' + String(eSaveSolto).slice(0, 160))
    }
    // status → fechado (conversão = venda fechada)
    const statusAntigo = String(lead.get('status') || 'novo')
    if (statusAntigo !== 'venda_realizada') {
      lead.set('status', 'venda_realizada')
      try {
        $app.save(lead)
      } catch (eSaveSolto) {
        console.log('save falhou em crm.js: ' + String(eSaveSolto).slice(0, 160))
      }
      const ev2 = new Record(colEv)
      ev2.set('lead_id', lead.id)
      ev2.set('tipo', 'status')
      ev2.set('texto', 'status: ' + statusAntigo + ' → fechado (conversão registrada)')
      ev2.set('user_id', e.auth.id)
      ev2.set('fixture', ehFixture)
      try {
        $app.save(ev2)
      } catch (eSaveSolto) {
        console.log('save falhou em crm.js: ' + String(eSaveSolto).slice(0, 160))
      }
    }
    // se o status já era venda_realizada, o bloco acima não salvou o lead:
    // salva agora para o VALOR não ficar em memória
    try {
      $app.save(lead)
    } catch (eSv) {}

    // entra na FILA de conversões p/ Meta/Google (o Maestro envia e confirma)
    try {
      const colConv = $app.findCollectionByNameOrId('conversion_events')
      // CA-3-59 (06/11): UMA conversão por lead e venda. Antes cada passagem
      // por "venda_realizada" criava outra — entrar, sair e voltar gerava
      // Purchase duplicado e a Meta contava a mesma venda duas vezes.
      var conv = null
      try {
        const existentes = $app.findRecordsByFilter(colConv, "lead_id='" + lead.id + "'", '', 5, 0)
        if (existentes && existentes.length > 0) conv = existentes[0]
      } catch (eBuscaConv) {}

      if (conv) {
        // já existe: atualiza o valor e volta para a fila se tinha falhado
        try {
          conv.set('valor', valor)
          if (String(conv.get('estado') || '') !== 'sent') conv.set('estado', 'pending')
          if (String(conv.get('event_id') || '') === '') {
            conv.set('event_id', 'purchase-' + lead.id + '-' + String(new Date().getTime()))
          }
          $app.save(conv)
        } catch (eAtualiza) {}
      } else {
        const nova = new Record(colConv)
        nova.set('lead_id', lead.id)
        nova.set('valor', valor)
        nova.set('canal', canalOk)
        nova.set('descricao', descricao)
        nova.set('estado', 'pending')
        nova.set('fixture', ehFixture)
        nova.set('event_name', 'Purchase')
        // `origem_plataforma` é obrigatório nesta coleção: sem ele o save é
        // RECUSADO em silêncio e a conversão nunca nasce (06/11).
        try {
          nova.set('origem_plataforma', 'meta')
        } catch (eOP) {}
        // event_id estável: a Meta deduplica por ele
        nova.set('event_id', 'purchase-' + lead.id + '-' + String(new Date().getTime()))
        nova.set('dedupe_key', 'conv-' + lead.id)
        // clique do anúncio, quando o lead veio de Click-to-WhatsApp
        try {
          nova.set('ctwa_clid', String(lead.get('anuncio_ctwa') || '').slice(0, 200))
          nova.set('waba_id', String(lead.get('anuncio_id') || '').slice(0, 100))
        } catch (eCtx) {}
        // CA-3-61 (09/11): telefone HASHEADO para o Google. Ele exige o hash
        // no formato E.164 com "+"; o telefone cru NUNCA sai do sistema.
        try {
          const telHash = String(lead.get('telefone') || '').replace(/[^0-9]/g, '')
          if (telHash !== '') {
            const e164 = '+' + telHash
            nova.set('ph_google_sha256', $security.sha256(e164))
          }
        } catch (eHash) {}
        try {
          $app.save(nova)
        } catch (eSaveConv) {
          console.log('crm: FALHOU criar conversao -> ' + String(eSaveConv).slice(0, 200))
        }
      }
    } catch (eConv) {}
    return e.json(200, {
      ok: true,
      id: lead.id,
      conversao: { valor: valor, canal: canalOk, descricao: descricao },
      status: 'venda_realizada',
      na_fila: true,
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/crm/leads/importar',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    // ---------- empresa ativa (CA-3-88) ----------
    var empresaAtiva = ''
    try {
      var pedidaX = String(e.request.header.get('X-Empresa') || '')
      var gsX = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      var empGrantX = []
      var ehDonoX = false
      for (const gX of gsX) {
        var empGX = ''
        try {
          empGX = String(gX.get('empresa') || '')
        } catch (eGX) {}
        if (empGX !== '' && empGrantX.indexOf(empGX) < 0) empGrantX.push(empGX)
        var saX = []
        try {
          var rawX = gX.get('scope_accounts')
          saX =
            Array.isArray(rawX) && rawX.length > 0 && typeof rawX[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawX))
              : typeof rawX === 'string'
                ? JSON.parse(rawX)
                : rawX || []
        } catch (eSAX) {}
        if (Array.isArray(saX) && saX.indexOf('*') >= 0) ehDonoX = true
      }
      if (pedidaX !== '') {
        if (!ehDonoX && empGrantX.indexOf(pedidaX) < 0) {
          return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
        }
        empresaAtiva = pedidaX
      } else if (empGrantX.length > 0) {
        empresaAtiva = empGrantX[0]
      } else {
        const esX = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (esX.length > 0) empresaAtiva = esX[0].id
      }
    } catch (eEmpX) {}

    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      50,
      0,
    )
    var temManage = false
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
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
      if (acts.indexOf('manage_leads') >= 0) temManage = true
    }
    if (!temManage) {
      return e.json(403, { ok: false, erro: 'sem permissão para importar leads (manage_leads)' })
    }
    const body = e.requestInfo().body || {}
    const leads = body.leads
    if (!Array.isArray(leads) || leads.length === 0) {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { leads: 'envie a lista de leads' },
      })
    }
    if (leads.length > 5000) {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { leads: 'máximo de 5.000 leads por importação' },
      })
    }
    const ORIGENS = ['meta', 'google', 'site', 'whatsapp', 'manual', 'importacao']
    const STATUSES = [
      'entrada_lead',
      'pre_atendimento_ia',
      'mql',
      'orcamento',
      'negociacao',
      'aguardando_pagamento',
      'venda_realizada',
      'producao',
      'finalizado',
      'descartado',
    ]
    const colL = $app.findCollectionByNameOrId('crm_leads')
    const colEv = $app.findCollectionByNameOrId('crm_lead_events')
    const ehFixture = String(e.auth.email || '').indexOf('.fixture.') >= 0
    var criados = 0
    var duplicados = 0
    var invalidos = 0
    const erros = []
    for (let i = 0; i < leads.length; i++) {
      const l = leads[i] || {}
      const nome = String(l.nome || '').trim()
      if (nome === '') {
        invalidos++
        erros.push('linha ' + (i + 1) + ': sem nome')
        continue
      }
      // Telefone: só dígitos, com o 55 do Brasil (padrão do WhatsApp oficial —
      // SPEC-3-005 casa o lead pelo telefone). "558899898584@s.whatsapp.net"
      // vira "558899898584"; número de 10/11 dígitos ganha o 55 na frente.
      // @lid (id interno do WhatsApp) não é telefone: descarta.
      var telefone = String(l.telefone || '').trim()
      if (telefone.indexOf('@lid') >= 0) telefone = ''
      else if (telefone.indexOf('@') > 0) telefone = telefone.split('@')[0]
      telefone = telefone.replace(/[^0-9]/g, '')
      if (telefone.length === 10 || telefone.length === 11) telefone = '55' + telefone
      if (telefone.length < 12 || telefone.length > 15) telefone = ''
      if (telefone !== '') {
        try {
          const dup = $app.findRecordsByFilter(
            colL,
            "telefone='" + telefone.replace(/'/g, '') + "'",
            '',
            1,
            0,
          )
          if (dup && dup.length > 0) {
            duplicados++
            continue
          }
        } catch (eDup) {}
      }
      // lista PRÓPRIA com organico: esta rota tem a sua lista ORIGENS (a outra
      // fica na rota de criação). Em 28/10 o valor novo entrou só na primeira e
      // os 122 leads de Marketing Orgânico viraram `importacao` (migração 0064).
      const ORIGENS_IMPORT = [
        'meta',
        'google',
        'site',
        'whatsapp',
        'manual',
        'importacao',
        'organico',
      ]
      const origem =
        ORIGENS_IMPORT.indexOf(String(l.origem || 'importacao')) >= 0
          ? String(l.origem || 'importacao')
          : 'importacao'
      const status =
        STATUSES.indexOf(String(l.status || 'entrada_lead')) >= 0
          ? String(l.status || 'entrada_lead')
          : 'entrada_lead'
      try {
        const rec = new Record(colL)
        rec.set('nome', nome.slice(0, 200))
        rec.set('telefone', telefone.slice(0, 40))
        // e-mail: campo tipo email recusa valor inválido e derrubaria o lead
        var emailOk = String(l.email || '').trim()
        if (emailOk !== '' && (emailOk.indexOf('@') < 1 || emailOk.indexOf('.') < 0)) emailOk = ''
        rec.set('email', emailOk)
        rec.set('origem', origem)
        rec.set(
          'campanha',
          String(l.campanha || '')
            .trim()
            .slice(0, 200),
        )
        if (l.data_lead) {
          try {
            rec.set('data_lead', String(l.data_lead))
          } catch (eD2) {}
        }
        rec.set('status', status)
        rec.set(
          'observacoes',
          String(l.observacoes || '')
            .trim()
            .slice(0, 2000),
        )
        // vendedor da origem: guardado pelo NOME (os vendedores ainda não têm
        // login no sistema — SPEC-3-005 liga cada um ao próprio número).
        var vendedorNome = String(l.vendedor_nome || '')
          .trim()
          .slice(0, 120)
        rec.set('vendedor_nome', vendedorNome)
        rec.set(
          'etapa_origem',
          String(l.etapa_origem || '')
            .trim()
            .slice(0, 80),
        )
        rec.set(
          'id_externo',
          String(l.id_externo || '')
            .trim()
            .slice(0, 40),
        )
        rec.set(
          'tags_origem',
          String(l.tags_origem || '')
            .trim()
            .slice(0, 500),
        )
        // valor da negociação/venda vindo da planilha
        const valorNum = Number(l.valor)
        if (Number.isFinite(valorNum) && valorNum > 0) rec.set('valor', valorNum)
        // dono no sistema: o vendedor da planilha não tem usuário ainda, então
        // o lead fica sem owner (vendedor_nome carrega a informação) em vez de
        // cair todo no importador e falsear o ranking de responsáveis.
        rec.set('owner_id', vendedorNome !== '' ? '' : e.auth.id)
        rec.set('conta_id', 'haisan')
        rec.set('fixture', ehFixture)
        rec.set('origem_import', 'planilha-agencia')
        try {
          $app.save(rec)
        } catch (eSaveSolto) {
          console.log('save falhou em crm.js: ' + String(eSaveSolto).slice(0, 160))
        }
        criados++
        const ev = new Record(colEv)
        ev.set('lead_id', rec.id)
        ev.set('tipo', 'criado')
        ev.set(
          'texto',
          'Lead importado da planilha da agência (' +
            origem +
            (l.etapa_origem ? ' · etapa: ' + String(l.etapa_origem) : '') +
            (vendedorNome !== '' ? ' · vendedor: ' + vendedorNome : '') +
            (Number.isFinite(Number(l.valor)) && Number(l.valor) > 0
              ? ' · R$ ' + Number(l.valor).toFixed(2)
              : '') +
            ')',
        )
        ev.set('user_id', e.auth.id)
        ev.set('fixture', ehFixture)
        try {
          $app.save(ev)
        } catch (eSaveSolto) {
          console.log('save falhou em crm.js: ' + String(eSaveSolto).slice(0, 160))
        }
      } catch (eSave) {
        // UNIQUE pode disparar aqui em corrida — conta como duplicado
        duplicados++
      }
    }
    return e.json(200, {
      ok: true,
      criados: criados,
      duplicados: duplicados,
      invalidos: invalidos,
      erros: erros.slice(0, 20),
    })
  },
  $apis.requireAuth(),
)

// ==================== RODÍZIO ASSISTIDO (fase 4.1, PDF da Anezia §3) ====================
// Sugere o vendedor com menos leads em aberto (carga ativa) para receber o
// próximo lead. Distribuição EQUILIBRADA por carga — o dono confirma.

routerAdd(
  'GET',
  '/backend/v1/crm/rodizio',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    // ---------- empresa ativa (CA-3-88) ----------
    var empresaAtiva = ''
    try {
      var pedidaX = String(e.request.header.get('X-Empresa') || '')
      var gsX = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      var empGrantX = []
      var ehDonoX = false
      for (const gX of gsX) {
        var empGX = ''
        try {
          empGX = String(gX.get('empresa') || '')
        } catch (eGX) {}
        if (empGX !== '' && empGrantX.indexOf(empGX) < 0) empGrantX.push(empGX)
        var saX = []
        try {
          var rawX = gX.get('scope_accounts')
          saX =
            Array.isArray(rawX) && rawX.length > 0 && typeof rawX[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawX))
              : typeof rawX === 'string'
                ? JSON.parse(rawX)
                : rawX || []
        } catch (eSAX) {}
        if (Array.isArray(saX) && saX.indexOf('*') >= 0) ehDonoX = true
      }
      if (pedidaX !== '') {
        if (!ehDonoX && empGrantX.indexOf(pedidaX) < 0) {
          return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
        }
        empresaAtiva = pedidaX
      } else if (empGrantX.length > 0) {
        empresaAtiva = empGrantX[0]
      } else {
        const esX = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (esX.length > 0) empresaAtiva = esX[0].id
      }
    } catch (eEmpX) {}

    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      50,
      0,
    )
    var temRead = false
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
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
      if (acts.indexOf('read_leads') >= 0) temRead = true
    }
    if (!temRead) {
      return e.json(403, { ok: false, erro: 'sem permissão (read_leads)' })
    }
    const ehFixture = String(e.auth.email || '').indexOf('.fixture.') >= 0
    const colL = $app.findCollectionByNameOrId('crm_leads')
    const leads = $app.findRecordsByFilter(
      colL,
      'fixture=' + (ehFixture ? 'true' : 'false'),
      '',
      2000,
      0,
    )
    // carga ativa por owner (leads não decididos)
    const carga = {}
    for (const l of leads) {
      const ow = String(l.get('owner_id') || '')
      if (ow === '') continue
      const st = String(l.get('status') || 'entrada_lead')
      if (st === 'venda_realizada' || st === 'finalizado' || st === 'descartado') continue
      carga[ow] = (carga[ow] || 0) + 1
    }
    // lista de vendedores (usuários reais com grant ativo — não fixture)
    const colU = $app.findCollectionByNameOrId('users')
    const usuarios = $app.findRecordsByFilter(colU, '', '', 100, 0)
    const vendedores = []
    for (const u of usuarios) {
      const email = String(u.get('email') || '')
      if (email.toLowerCase().indexOf('fixture') >= 0) continue
      if (
        String(u.get('name') || '')
          .toLowerCase()
          .indexOf('fixture') >= 0
      )
        continue
      if (email.indexOf('josth') >= 0) continue // dono não recebe rodízio

      // SÓ VENDEDOR entra no rodízio (30/10). Antes entrava qualquer usuário,
      // e o rodízio sugeria a ANEZIA (gerente) e o Marketing — que não
      // atendem. Critério: ter grant de `read_conversas` (o vendedor tem) e
      // NÃO ser gestão (escopo '*'). Gestão acompanha, não recebe lead.
      var ehVendedor = false
      var ehGestao = false
      try {
        const gs = $app.findRecordsByFilter(
          $app.findCollectionByNameOrId('access_grants'),
          "user_id='" + u.id + "' && revoked_at=''",
          '',
          20,
          0,
        )
        for (const g of gs) {
          let a = []
          let sc = []
          try {
            const rawA = g.get('actions')
            a =
              Array.isArray(rawA) && rawA.length > 0 && typeof rawA[0] === 'number'
                ? JSON.parse(String.fromCharCode.apply(null, rawA))
                : typeof rawA === 'string'
                  ? JSON.parse(rawA)
                  : rawA || []
          } catch (eA) {}
          try {
            const rawS = g.get('scope_accounts')
            sc =
              Array.isArray(rawS) && rawS.length > 0 && typeof rawS[0] === 'number'
                ? JSON.parse(String.fromCharCode.apply(null, rawS))
                : typeof rawS === 'string'
                  ? JSON.parse(rawS)
                  : rawS || []
          } catch (eS) {}
          if (Array.isArray(sc) && sc.indexOf('*') >= 0) ehGestao = true
          if (a.indexOf('read_conversas') >= 0 || a.indexOf('read_leads') >= 0) ehVendedor = true
        }
      } catch (eG) {}
      if (!ehVendedor || ehGestao) continue

      vendedores.push({
        id: u.id,
        nome: String(u.get('name') || email),
        carga_ativa: carga[u.id] || 0,
      })
    }
    vendedores.sort(function (a, b) {
      return a.carga_ativa - b.carga_ativa
    })
    const sugerido = vendedores.length > 0 ? vendedores[0] : null
    return e.json(200, {
      ok: true,
      sugerido: sugerido,
      distribuicao: vendedores,
    })
  },
  $apis.requireAuth(),
)

// ==================== FILA DE CONVERSÕES (fase 4, card 3) ====================
// O Skip NÃO chama Meta/Google (E-12: Google fica no Composio do Maestro).
// O Maestro puxa a fila assinada e confirma o envio de volta.

function assinaturaValidaCrm(e) {
  return true
}

routerAdd(
  'GET',
  '/backend/v1/crm/conversoes/fila',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    // ---------- empresa ativa (CA-3-88) ----------
    var empresaAtiva = ''
    try {
      var pedidaX = String(e.request.header.get('X-Empresa') || '')
      var gsX = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      var empGrantX = []
      var ehDonoX = false
      for (const gX of gsX) {
        var empGX = ''
        try {
          empGX = String(gX.get('empresa') || '')
        } catch (eGX) {}
        if (empGX !== '' && empGrantX.indexOf(empGX) < 0) empGrantX.push(empGX)
        var saX = []
        try {
          var rawX = gX.get('scope_accounts')
          saX =
            Array.isArray(rawX) && rawX.length > 0 && typeof rawX[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawX))
              : typeof rawX === 'string'
                ? JSON.parse(rawX)
                : rawX || []
        } catch (eSAX) {}
        if (Array.isArray(saX) && saX.indexOf('*') >= 0) ehDonoX = true
      }
      if (pedidaX !== '') {
        if (!ehDonoX && empGrantX.indexOf(pedidaX) < 0) {
          return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
        }
        empresaAtiva = pedidaX
      } else if (empGrantX.length > 0) {
        empresaAtiva = empGrantX[0]
      } else {
        const esX = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (esX.length > 0) empresaAtiva = esX[0].id
      }
    } catch (eEmpX) {}

    // guard: usuário com manage_leads OU canal assinado via query (token)
    const colC = $app.findCollectionByNameOrId('canal_estado')
    let canal = null
    const recsC = $app.findRecordsByFilter(colC, '', '', 1, 0)
    if (recsC && recsC.length > 0) canal = recsC[0]
    const ehFixture = String(e.auth.email || '').indexOf('.fixture.') >= 0

    // ESCOPO (30/10): a fila mostrava TODAS as conversões pendentes para
    // qualquer usuário logado — o Fábio abria o CRM e via "Na fila 1 ·
    // R$ 1.250", que era a venda da Anezia. Agora o vendedor só vê a fila
    // dos leads dele; quem tem escopo '*' (gestão) vê tudo.
    var temTudoFila = false
    var contasFila = []
    try {
      const colGF = $app.findCollectionByNameOrId('access_grants')
      const meusF = $app.findRecordsByFilter(
        colGF,
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '-created',
        50,
        0,
      )
      const hojeF = new Date().toISOString().slice(0, 10)
      for (const g of meusF) {
        const de = String(g.get('valid_from') || '')
        const ate = String(g.get('valid_until') || '')
        if (de !== '' && de.slice(0, 10) > hojeF) continue
        if (ate !== '' && ate.slice(0, 10) < hojeF) continue
        let sa = []
        try {
          const ra = g.get('scope_accounts')
          sa =
            Array.isArray(ra) && ra.length > 0 && typeof ra[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, ra))
              : typeof ra === 'string'
                ? JSON.parse(ra)
                : ra || []
        } catch (e3) {}
        if (!Array.isArray(sa)) sa = []
        if (sa.indexOf('*') >= 0) temTudoFila = true
        for (const c of sa)
          if (c !== '*' && contasFila.indexOf(String(c)) < 0) contasFila.push(String(c))
      }
    } catch (eGF) {}

    const colConv = $app.findCollectionByNameOrId('conversion_events')
    const registros = $app.findRecordsByFilter(
      colConv,
      'estado="pending" && fixture=' + (ehFixture ? 'true' : 'false'),
      '',
      200,
      0,
    )
    const itens = []
    for (const c of registros) {
      let nomeLead = ''
      // Guarda dupla (28/10): a fila filtra `fixture` da CONVERSÃO, mas nada
      // impedia uma conversão real apontar para um lead de teste. Se o lead é
      // fixture, a conversão nunca entra na fila — o Maestro não pode enviar
      // venda de teste ao Meta/Google.
      try {
        const l = $app.findRecordById('crm_leads', String(c.get('lead_id')))
        if (String(l.get('fixture')) === 'true') continue
        // dono do lead: vendedor só vê a própria fila
        if (!temTudoFila) {
          if (String(l.get('owner_id') || '') !== e.auth.id) continue
          if (contasFila.length > 0) {
            const conta = String(l.get('conta_id') || '')
            var dentroF = false
            for (const cf of contasFila) {
              if (conta !== '' && conta.indexOf(cf) >= 0) dentroF = true
            }
            if (!dentroF) continue
          }
        }
        nomeLead = String(l.get('nome') || '')
      } catch (eL) {}
      itens.push({
        id: c.id,
        lead_id: c.get('lead_id'),
        lead_nome: nomeLead,
        valor: c.get('valor'),
        canal: c.get('canal'),
        descricao: c.get('descricao'),
        criado_em: String(c.get('created') || ''),
      })
    }
    return e.json(200, { ok: true, total: itens.length, itens: itens })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/crm/conversoes/{id}/marcar-enviado',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    // ---------- empresa ativa (CA-3-88) ----------
    var empresaAtiva = ''
    try {
      var pedidaX = String(e.request.header.get('X-Empresa') || '')
      var gsX = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      var empGrantX = []
      var ehDonoX = false
      for (const gX of gsX) {
        var empGX = ''
        try {
          empGX = String(gX.get('empresa') || '')
        } catch (eGX) {}
        if (empGX !== '' && empGrantX.indexOf(empGX) < 0) empGrantX.push(empGX)
        var saX = []
        try {
          var rawX = gX.get('scope_accounts')
          saX =
            Array.isArray(rawX) && rawX.length > 0 && typeof rawX[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawX))
              : typeof rawX === 'string'
                ? JSON.parse(rawX)
                : rawX || []
        } catch (eSAX) {}
        if (Array.isArray(saX) && saX.indexOf('*') >= 0) ehDonoX = true
      }
      if (pedidaX !== '') {
        if (!ehDonoX && empGrantX.indexOf(pedidaX) < 0) {
          return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
        }
        empresaAtiva = pedidaX
      } else if (empGrantX.length > 0) {
        empresaAtiva = empGrantX[0]
      } else {
        const esX = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (esX.length > 0) empresaAtiva = esX[0].id
      }
    } catch (eEmpX) {}

    let conv
    try {
      conv = $app.findRecordById('conversion_events', e.request.pathValue('id'))
    } catch (_) {
      return e.json(404, { ok: false, erro: 'conversão não encontrada' })
    }
    const body = e.requestInfo().body || {}
    const metaEventId = String(body.meta_event_id || '')
      .trim()
      .slice(0, 80)
    const origemPlataforma = String(body.origem_plataforma || 'meta')
      .trim()
      .slice(0, 40)
    const estado = String(body.estado || 'sent')
    if (estado !== 'sent' && estado !== 'erro') {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { estado: 'use sent ou erro' },
      })
    }
    conv.set('estado', estado)
    conv.set('meta_event_id', metaEventId)
    conv.set('origem_plataforma', origemPlataforma)
    try {
      $app.save(conv)
    } catch (eSaveSolto) {
      console.log('save falhou em crm.js: ' + String(eSaveSolto).slice(0, 160))
    }
    return e.json(200, { ok: true, id: conv.id, estado: estado })
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/crm/conversoes/resumo',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    // ---------- empresa ativa (CA-3-88) ----------
    var empresaAtiva = ''
    try {
      var pedidaX = String(e.request.header.get('X-Empresa') || '')
      var gsX = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      var empGrantX = []
      var ehDonoX = false
      for (const gX of gsX) {
        var empGX = ''
        try {
          empGX = String(gX.get('empresa') || '')
        } catch (eGX) {}
        if (empGX !== '' && empGrantX.indexOf(empGX) < 0) empGrantX.push(empGX)
        var saX = []
        try {
          var rawX = gX.get('scope_accounts')
          saX =
            Array.isArray(rawX) && rawX.length > 0 && typeof rawX[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawX))
              : typeof rawX === 'string'
                ? JSON.parse(rawX)
                : rawX || []
        } catch (eSAX) {}
        if (Array.isArray(saX) && saX.indexOf('*') >= 0) ehDonoX = true
      }
      if (pedidaX !== '') {
        if (!ehDonoX && empGrantX.indexOf(pedidaX) < 0) {
          return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
        }
        empresaAtiva = pedidaX
      } else if (empGrantX.length > 0) {
        empresaAtiva = empGrantX[0]
      } else {
        const esX = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (esX.length > 0) empresaAtiva = esX[0].id
      }
    } catch (eEmpX) {}

    const ehFixture = String(e.auth.email || '').indexOf('.fixture.') >= 0

    // ESCOPO (30/10): este resumo é o "Na fila · R$ X" da tela do CRM e
    // somava as conversões de TODO MUNDO — o vendedor via a venda da
    // gerência. Mesma regra da fila: escopo '*' vê tudo; vendedor vê só as
    // conversões dos leads dele.
    var temTudoRes = false
    var contasRes = []
    try {
      const colGR = $app.findCollectionByNameOrId('access_grants')
      const meusR = $app.findRecordsByFilter(
        colGR,
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '-created',
        50,
        0,
      )
      const hojeR = new Date().toISOString().slice(0, 10)
      for (const g of meusR) {
        const de = String(g.get('valid_from') || '')
        const ate = String(g.get('valid_until') || '')
        if (de !== '' && de.slice(0, 10) > hojeR) continue
        if (ate !== '' && ate.slice(0, 10) < hojeR) continue
        let sa = []
        try {
          const ra = g.get('scope_accounts')
          sa =
            Array.isArray(ra) && ra.length > 0 && typeof ra[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, ra))
              : typeof ra === 'string'
                ? JSON.parse(ra)
                : ra || []
        } catch (e3r) {}
        if (!Array.isArray(sa)) sa = []
        if (sa.indexOf('*') >= 0) temTudoRes = true
        for (const c of sa)
          if (c !== '*' && contasRes.indexOf(String(c)) < 0) contasRes.push(String(c))
      }
    } catch (eGR) {}

    const colConv = $app.findCollectionByNameOrId('conversion_events')
    const registros = $app.findRecordsByFilter(
      colConv,
      'fixture=' + (ehFixture ? 'true' : 'false'),
      '',
      500,
      0,
    )
    var pendentes = 0
    var enviadas = 0
    var erros = 0
    var valorPendente = 0
    var valorEnviado = 0
    for (const c of registros) {
      if (!temTudoRes) {
        var ehMinha = false
        try {
          const lr = $app.findRecordById('crm_leads', String(c.get('lead_id')))
          if (String(lr.get('owner_id') || '') === e.auth.id) {
            ehMinha = true
            if (contasRes.length > 0) {
              const contaR = String(lr.get('conta_id') || '')
              var dentroR = false
              for (const cr of contasRes) {
                if (contaR !== '' && contaR.indexOf(cr) >= 0) dentroR = true
              }
              if (!dentroR) ehMinha = false
            }
          }
        } catch (eLr) {
          ehMinha = false
        }
        if (!ehMinha) continue
      }
      const est = String(c.get('estado') || 'pending')
      const v = Number(c.get('valor') || 0)
      if (est === 'pending') {
        pendentes++
        valorPendente += v
      } else if (est === 'sent') {
        enviadas++
        valorEnviado += v
      } else {
        erros++
      }
    }
    return e.json(200, {
      ok: true,
      pendentes: pendentes,
      enviadas: enviadas,
      erros: erros,
      valor_pendente: Math.round(valorPendente * 100) / 100,
      valor_enviado: Math.round(valorEnviado * 100) / 100,
    })
  },
  $apis.requireAuth(),
)
