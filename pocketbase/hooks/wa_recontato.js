/// <reference path="../pb_data/types.d.ts" />
/**
 * CLIENTES PARA RECONTATAR — CA-3-47 / RN-139 (SPEC-3-009, 05/11).
 *
 * **O problema:** lead que entrou e nunca recebeu um "oi" fica parado para
 * sempre. Ninguém vê, ninguém cobra. Em 05/11 a vendedora disse que perdeu
 * leads desde 02/11.
 *
 * **A regra (RN-139, palavra por palavra):**
 *   - lead DA VENDEDORA (owner_id = ela)
 *   - criado desde 31/10
 *   - SEM nenhuma mensagem de autor `vendedor` em qualquer número
 *   - ainda em `entrada_lead`, `pre_atendimento_ia` ou `mql`
 *   - fora: descartado, fixture e número interno da equipe
 *
 * **Não é "o cliente não respondeu".** É "nunca houve contato nosso pelo
 * WhatsApp do vendedor". Se ele já recebeu um oi, sai da lista — mesmo que
 * não tenha respondido.
 *
 * Rotas:
 *   GET  /backend/v1/crm/recontato            → lista da pessoa logada
 *   POST /backend/v1/crm/recontato/contatado  → marca {id} como contatado
 *
 * JSVM: helpers INLINE; sort sempre vazio; nada de função no topo.
 */
routerAdd(
  'GET',
  '/backend/v1/crm/recontato',
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
    const out = { ok: true, total: 0, itens: [], sem_contato_desde: '2026-10-31', erro: '' }

    // ---------- permissão e escopo ----------
    var temRead = false
    var temTudo = false
    try {
      const meus = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '-created',
        60,
        0,
      )
      for (const g of meus) {
        const de = String(g.get('valid_from') || '')
        const ate = String(g.get('valid_until') || '')
        if (de !== '' && de.slice(0, 10) > hoje) continue
        if (ate !== '' && ate.slice(0, 10) < hoje) continue
        const a = lerL(g.get('actions'))
        if (a.indexOf('read_leads') < 0) continue
        temRead = true
        const sc = lerL(g.get('scope_accounts'))
        if (Array.isArray(sc) && sc.indexOf('*') >= 0) temTudo = true
      }
    } catch (e0) {}
    if (!temRead) return e.json(403, { ok: false, erro: 'sem permissão para ver leads' })

    // ---------- números internos da equipe (não são cliente) ----------
    const internos = {}
    try {
      const colCfg = app.findCollectionByNameOrId('atendimento_config')
      const vs = app.findRecordsByFilter(colCfg, '', '', 500, 0)
      for (const v of vs) {
        var lista = []
        try {
          const rawI = v.get('internos')
          lista =
            Array.isArray(rawI) && rawI.length > 0 && typeof rawI[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawI))
              : typeof rawI === 'string'
                ? JSON.parse(rawI)
                : rawI || []
        } catch (eI) {}
        if (!Array.isArray(lista)) continue
        for (const i of lista) {
          const n = String(i.numero || '').replace(/\D/g, '')
          if (n !== '') internos[n] = true
        }
      }
    } catch (e1) {}

    // ---------- quem já recebeu mensagem de VENDEDOR (qualquer número) ----------
    const comContato = {}
    try {
      const msgs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "direcao='saida' && autor='vendedor'",
        '',
        8000,
        0,
      )
      for (const m of msgs) {
        const tel = String(m.get('contato_telefone') || '').replace(/\D/g, '')
        if (tel !== '') comContato[tel] = true
      }
    } catch (e2) {}

    // ---------- leads ----------
    var leads = []
    try {
      leads = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        8000,
        0,
      )
    } catch (e3) {
      out.ok = false
      out.erro = 'leads: ' + String(e3).slice(0, 150)
      return e.json(200, out)
    }

    const STATUS_OK = ['entrada_lead', 'pre_atendimento_ia', 'mql']
    const DESDE = '2026-10-31'

    // CA-3-109 (09/11): marca o lead cuja APRESENTAÇÃO não chegou.
    // A apresentação é o aviso automático ao cliente ("oi, sou o vendedor X").
    // Quando ela falha, o cliente NUNCA soube que existe, mas o lead fica
    // "em aberto" como se estivesse andando — o vendedor precisa saber que
    // tem de chamar pessoalmente.
    //
    // NÃO reenvia nada: só marca na lista.
    const apresentacaoFalhou = {}
    try {
      const envs = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_envios'),
        "motivo='apresentacao_vendedor'",
        '',
        3000,
        0,
      )
      for (const en of envs) {
        const est = String(en.get('estado') || '')
        if (est !== 'erro' && est !== 'erro_definitivo') continue
        const lid = String(en.get('lead') || '')
        if (lid !== '') apresentacaoFalhou[lid] = true
      }
    } catch (eApF) {}
    const agoraMs = new Date().getTime()

    for (const l of leads) {
      // dono
      const dono = String(l.get('owner_id') || '')
      if (!temTudo && dono !== e.auth.id) continue
      if (temTudo && dono === '') continue // sem dono não é "da vendedora"
      // status
      if (STATUS_OK.indexOf(String(l.get('status') || '')) < 0) continue
      // desde 31/10
      var criado = ''
      try {
        criado = String(l.get('created') || '').slice(0, 10)
      } catch (eC) {}
      if (criado !== '' && criado < DESDE) continue
      // telefone
      const tel = String(l.get('telefone') || '').replace(/\D/g, '')
      if (tel === '') continue
      // número interno da equipe não é cliente
      if (internos[tel]) continue
      // já recebeu oi de vendedor -> fora
      if (comContato[tel]) continue
      // já marcado como contatado -> fora
      if (String(l.get('recontato_em') || '') !== '') continue

      // dias desde a criação (para ordenar: mais antigo primeiro)
      var quando = 0
      try {
        quando = new Date(String(l.get('created') || '')).getTime()
      } catch (eQ) {}
      const dias = quando > 0 ? Math.floor((agoraMs - quando) / 86400000) : -1

      out.itens.push({
        id: l.id,
        nome: String(l.get('nome') || ''),
        telefone: String(l.get('telefone') || ''),
        status: String(l.get('status') || ''),
        origem: String(l.get('origem') || ''),
        data_lead: String(l.get('data_lead') || '').slice(0, 10),
        criado: criado,
        dias_esperando: dias,
        vendedor_nome: String(l.get('vendedor_nome') || ''),
        // CA-3-109: o cliente não recebeu o aviso automático
        apresentacao_nao_chegou: apresentacaoFalhou[l.id] === true,
        marca: apresentacaoFalhou[l.id] === true ? 'apresentação não chegou' : '',
      })
    }

    // mais antigo primeiro: é quem está esperando há mais tempo
    out.itens.sort(function (a, b) {
      if (a.dias_esperando === b.dias_esperando) return 0
      return b.dias_esperando - a.dias_esperando
    })
    out.total = out.itens.length
    return e.json(200, out)
  },
  $apis.requireAuth(),
)

// ==================== MARCAR CONTATADO ====================
routerAdd(
  'POST',
  '/backend/v1/crm/recontato/contatado',
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

    var temTudo = false
    var temRead = false
    try {
      const meus = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '-created',
        60,
        0,
      )
      for (const g of meus) {
        const de = String(g.get('valid_from') || '')
        const ate = String(g.get('valid_until') || '')
        if (de !== '' && de.slice(0, 10) > hoje) continue
        if (ate !== '' && ate.slice(0, 10) < hoje) continue
        const a = lerA(g.get('actions'))
        if (a.indexOf('read_leads') >= 0) temRead = true
        const sc = lerA(g.get('scope_accounts'))
        if (Array.isArray(sc) && sc.indexOf('*') >= 0) temTudo = true
      }
    } catch (e0) {}
    if (!temRead) return e.json(403, { ok: false, erro: 'sem permissão' })

    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}
    const id = String(body.id || '')
    if (id === '') return e.json(422, { ok: false, erro: 'informe o lead' })

    var lead = null
    try {
      lead = app.findRecordById('crm_leads', id)
    } catch (e1) {
      return e.json(404, { ok: false, erro: 'lead não encontrado' })
    }

    // vendedor só marca o próprio lead
    const dono = String(lead.get('owner_id') || '')
    if (!temTudo && dono !== e.auth.id) {
      return e.json(403, { ok: false, erro: 'este lead não é da sua carteira' })
    }

    const agoraISO = new Date().toISOString()
    try {
      lead.set('recontato_em', agoraISO)
      lead.set('recontato_por', String(e.auth.id).slice(0, 60))
      app.save(lead)
    } catch (e2) {
      return e.json(500, { ok: false, erro: 'não consegui marcar: ' + String(e2).slice(0, 140) })
    }

    // trilha: o recontato tem de ser auditável
    try {
      const ev = new Record(app.findCollectionByNameOrId('crm_lead_events'))
      ev.set('lead_id', lead.id)
      ev.set('tipo', 'nota')
      ev.set('texto', 'Recontato marcado como contatado em ' + hoje)
      ev.set('user_id', e.auth.id)
      ev.set('fixture', false)
      app.save(ev)
    } catch (e3) {}

    return e.json(200, {
      ok: true,
      id: lead.id,
      recontato_em: agoraISO,
      nome: String(lead.get('nome') || ''),
    })
  },
  $apis.requireAuth(),
)
