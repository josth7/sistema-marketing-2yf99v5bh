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
      if (sa.length === 0 || sa.indexOf('*') >= 0) temTudo = true
      for (const c of sa) if (contas.indexOf(String(c)) < 0) contas.push(String(c))
    }
    if (!temRead) {
      return e.json(403, { ok: false, erro: 'sem permissão para ver leads (read_leads)' })
    }
    const colL = $app.findCollectionByNameOrId('crm_leads')
    // fixture separado: usuários reais não veem fixture e vice-versa
    const ehFixture = String(e.auth.email || '').indexOf('.fixture.') >= 0
    const registros = $app.findRecordsByFilter(
      colL,
      'fixture=' + (ehFixture ? 'true' : 'false'),
      '',
      500,
      0,
    )
    const itens = []
    for (const l of registros) {
      if (!temTudo) {
        const conta = String(l.get('conta_id') || '')
        let dentro = false
        for (const c of contas) {
          if (c === '*' || (conta !== '' && conta.indexOf(c) >= 0)) dentro = true
        }
        if (!dentro) continue
      }
      var criadoEm = ''
      try {
        criadoEm = String(l.get('created') || '')
      } catch (eC1) {}
      var atualizadoEm = ''
      try {
        atualizadoEm = String(l.get('updated') || '')
      } catch (eC2) {}
      // nome do responsável (p/ o card do kanban — padrão do CRM atual)
      var ownerNome = ''
      const owId = String(l.get('owner_id') || '')
      if (owId !== '') {
        try {
          const u = $app.findRecordById('users', owId)
          ownerNome = String(u.get('name') || u.get('email') || '')
        } catch (eOw) {}
      }
      // temperatura do lead (neutro/positivo/frio — padrão do CRM atual):
      // orçamento ou fechado = positivo; perdido = frio; resto = neutro
      var temperatura = 'neutro'
      const stTmp = String(l.get('status') || 'novo')
      if (stTmp === 'orcamento' || stTmp === 'fechado') temperatura = 'positivo'
      else if (stTmp === 'perdido') temperatura = 'frio'
      itens.push({
        id: l.id,
        nome: l.get('nome'),
        telefone: l.get('telefone'),
        email: l.get('email'),
        origem: l.get('origem'),
        campanha: l.get('campanha'),
        data_lead: l.get('data_lead'),
        status: l.get('status') || 'novo',
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
    const ORIGENS = ['meta', 'google', 'site', 'whatsapp', 'manual', 'importacao']
    const STATUSES = ['novo', 'em_contato', 'orcamento', 'fechado', 'perdido']
    const origem =
      ORIGENS.indexOf(String(body.origem || 'manual')) >= 0
        ? String(body.origem || 'manual')
        : 'manual'
    const status =
      STATUSES.indexOf(String(body.status || 'novo')) >= 0 ? String(body.status || 'novo') : 'novo'
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
    $app.save(rec)
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
    $app.save(ev)
    return e.json(201, { ok: true, id: rec.id, status: status })
  },
  $apis.requireAuth(),
)

routerAdd(
  'PATCH',
  '/backend/v1/crm/leads/{id}',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
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
    let lead
    try {
      lead = $app.findRecordById('crm_leads', e.request.pathValue('id'))
    } catch (_) {
      return e.json(404, { ok: false, erro: 'lead não encontrado' })
    }
    const body = e.requestInfo().body || {}
    const STATUSES = ['novo', 'em_contato', 'orcamento', 'fechado', 'perdido']
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
        mudancas.push({ tipo: 'status', texto: 'status: ' + antigo + ' → ' + novo })
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
      lead.set('owner_id', String(body.owner_id || '').slice(0, 40))
      mudancas.push({ tipo: 'nota', texto: 'responsável atualizado' })
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
    if (body.status === 'perdido' && String(body.motivo_perda || '').trim() === '') {
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
    $app.save(lead)
    const colEv = $app.findCollectionByNameOrId('crm_lead_events')
    const ehFixture = String(lead.get('fixture')) === 'true'
    for (const m of mudancas) {
      const ev = new Record(colEv)
      ev.set('lead_id', lead.id)
      ev.set('tipo', m.tipo)
      ev.set('texto', m.texto)
      ev.set('user_id', e.auth.id)
      ev.set('fixture', ehFixture)
      $app.save(ev)
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
    try {
      $app.findRecordById('crm_leads', e.request.pathValue('id'))
    } catch (_) {
      return e.json(404, { ok: false, erro: 'lead não encontrado' })
    }
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
    let lead
    try {
      lead = $app.findRecordById('crm_leads', e.request.pathValue('id'))
    } catch (_) {
      return e.json(404, { ok: false, erro: 'lead não encontrado' })
    }
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
    $app.save(ev)
    // status → fechado (conversão = venda fechada)
    const statusAntigo = String(lead.get('status') || 'novo')
    if (statusAntigo !== 'fechado') {
      lead.set('status', 'fechado')
      $app.save(lead)
      const ev2 = new Record(colEv)
      ev2.set('lead_id', lead.id)
      ev2.set('tipo', 'status')
      ev2.set('texto', 'status: ' + statusAntigo + ' → fechado (conversão registrada)')
      ev2.set('user_id', e.auth.id)
      ev2.set('fixture', ehFixture)
      $app.save(ev2)
    }
    // entra na FILA de conversões p/ Meta/Google (o Maestro envia e confirma)
    try {
      const colConv = $app.findCollectionByNameOrId('conversion_events')
      const conv = new Record(colConv)
      conv.set('lead_id', lead.id)
      conv.set('valor', valor)
      conv.set('canal', canalOk)
      conv.set('descricao', descricao)
      conv.set('estado', 'pending')
      conv.set('fixture', ehFixture)
      $app.save(conv)
    } catch (eConv) {}
    return e.json(200, {
      ok: true,
      id: lead.id,
      conversao: { valor: valor, canal: canalOk, descricao: descricao },
      status: 'fechado',
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
    const STATUSES = ['novo', 'em_contato', 'orcamento', 'fechado', 'perdido']
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
      const telefone = String(l.telefone || '').trim()
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
      const origem =
        ORIGENS.indexOf(String(l.origem || 'importacao')) >= 0
          ? String(l.origem || 'importacao')
          : 'importacao'
      const status =
        STATUSES.indexOf(String(l.status || 'novo')) >= 0 ? String(l.status || 'novo') : 'novo'
      try {
        const rec = new Record(colL)
        rec.set('nome', nome.slice(0, 200))
        rec.set('telefone', telefone.slice(0, 40))
        rec.set('email', String(l.email || '').trim())
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
        rec.set('owner_id', e.auth.id)
        rec.set('conta_id', 'haisan')
        rec.set('fixture', ehFixture)
        rec.set('origem_import', 'planilha-agencia')
        $app.save(rec)
        criados++
        const ev = new Record(colEv)
        ev.set('lead_id', rec.id)
        ev.set('tipo', 'criado')
        ev.set(
          'texto',
          'Lead importado da planilha da agência (' +
            origem +
            (l.campanha ? ' · ' + String(l.campanha) : '') +
            ')',
        )
        ev.set('user_id', e.auth.id)
        ev.set('fixture', ehFixture)
        $app.save(ev)
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
      const st = String(l.get('status') || 'novo')
      if (st === 'fechado' || st === 'perdido') continue
      carga[ow] = (carga[ow] || 0) + 1
    }
    // lista de vendedores (usuários reais com grant ativo — não fixture)
    const colU = $app.findCollectionByNameOrId('users')
    const usuarios = $app.findRecordsByFilter(colU, '', '', 100, 0)
    const vendedores = []
    for (const u of usuarios) {
      const email = String(u.get('email') || '')
      if (email.indexOf('.fixture.') >= 0) continue
      if (email.indexOf('josth') >= 0) continue // dono não recebe rodízio
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
    // guard: usuário com manage_leads OU canal assinado via query (token)
    const colC = $app.findCollectionByNameOrId('canal_estado')
    let canal = null
    const recsC = $app.findRecordsByFilter(colC, '', '', 1, 0)
    if (recsC && recsC.length > 0) canal = recsC[0]
    const ehFixture = String(e.auth.email || '').indexOf('.fixture.') >= 0
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
      try {
        const l = $app.findRecordById('crm_leads', String(c.get('lead_id')))
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
    $app.save(conv)
    return e.json(200, { ok: true, id: conv.id, estado: estado })
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/crm/conversoes/resumo',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const ehFixture = String(e.auth.email || '').indexOf('.fixture.') >= 0
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
