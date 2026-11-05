/// <reference path="../pb_data/types.d.ts" />
/**
 * PRECISA DE AÇÃO — CA-3-69 / RN-134 (SPEC-3-009, 05/11).
 *
 * **A regra:** cliente do vendedor X fica com X. Quando X sai da empresa, os
 * leads dele NÃO vão para o rodízio — ficam esperando a **gestão decidir**
 * para quem vão. Trocar cliente de mãos sem ninguém olhar é o que a SPEC
 * proíbe.
 *
 * Rotas (todas exigem `manage_access` ou escopo `*`):
 *   GET  /backend/v1/gestao/precisa-acao        → fila, com totais por motivo
 *   POST /backend/v1/gestao/passar-carteira     → {de, para} move em bloco,
 *                                                 um evento por lead
 *
 * JSVM: helpers INLINE.
 */

// ==================== LISTAR ====================
routerAdd(
  'GET',
  '/backend/v1/gestao/precisa-acao',
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

    // ---------- só gestão ----------
    var pode = false
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
        const sc = lerL(g.get('scope_accounts'))
        if (a.indexOf('manage_access') >= 0) pode = true
        if (Array.isArray(sc) && sc.indexOf('*') >= 0) pode = true
      }
    } catch (e0) {}
    if (!pode) return e.json(403, { ok: false, erro: 'só a gestão' })

    const out = { ok: true, total: 0, por_dono: {}, por_motivo: {}, itens: [] }

    var fila = []
    try {
      fila = app.findRecordsByFilter(
        app.findCollectionByNameOrId('precisa_acao'),
        'resolvido=false && fixture=false',
        '',
        4000,
        0,
      )
    } catch (e1) {
      out.ok = false
      out.erro = 'fila: ' + String(e1).slice(0, 150)
      return e.json(200, out)
    }

    const colL = app.findCollectionByNameOrId('crm_leads')
    const colU = app.findCollectionByNameOrId('users')
    var nomesU = {}
    try {
      for (const u of app.findRecordsByFilter(colU, '', '', 400, 0)) {
        nomesU[u.id] = String(u.get('name') || u.get('email') || '')
      }
    } catch (e2) {}

    for (const f of fila) {
      const leadId = String(f.get('lead') || '')
      var lead = null
      try {
        lead = app.findRecordById(colL, leadId)
      } catch (e3) {}
      const de = String(f.get('dono_anterior') || '')
      const nomeDe = String(f.get('dono_anterior_nome') || '') || nomesU[de] || de
      const motivo = String(f.get('motivo') || '')
      out.por_dono[nomeDe] = (out.por_dono[nomeDe] || 0) + 1
      out.por_motivo[motivo] = (out.por_motivo[motivo] || 0) + 1
      out.itens.push({
        id: f.id,
        lead: leadId,
        nome: lead ? String(lead.get('nome') || '') : '(lead apagado)',
        telefone: lead ? String(lead.get('telefone') || '') : '',
        status: lead ? String(lead.get('status') || '') : '',
        dono_anterior: de,
        dono_anterior_nome: nomeDe,
        motivo: motivo,
        criado: String(f.get('created') || '').slice(0, 16),
      })
    }

    out.total = out.itens.length
    return e.json(200, out)
  },
  $apis.requireAuth(),
)

// ==================== PASSAR A CARTEIRA EM BLOCO ====================
routerAdd(
  'POST',
  '/backend/v1/gestao/passar-carteira',
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
    const agoraISO = new Date().toISOString()

    var pode = false
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
        const sc = lerA(g.get('scope_accounts'))
        if (a.indexOf('manage_access') >= 0) pode = true
        if (Array.isArray(sc) && sc.indexOf('*') >= 0) pode = true
      }
    } catch (e0) {}
    if (!pode) return e.json(403, { ok: false, erro: 'só a gestão' })

    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}
    const de = String(body.de || '')
    const para = String(body.para || '')
    if (de === '' || para === '') {
      return e.json(422, { ok: false, erro: 'informe {de, para}' })
    }
    if (de === para) {
      return e.json(422, { ok: false, erro: 'origem e destino são a mesma pessoa' })
    }

    // destino tem de existir e ter acesso
    var nomePara = ''
    try {
      const u = app.findRecordById('users', para)
      nomePara = String(u.get('name') || u.get('email') || '')
    } catch (e1) {
      return e.json(404, { ok: false, erro: 'destino não encontrado' })
    }

    // ---------- leads do dono que saiu ----------
    var leads = []
    try {
      leads = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        "owner_id='" + de + "' && fixture=false",
        '',
        4000,
        0,
      )
    } catch (e2) {
      return e.json(500, { ok: false, erro: 'não consegui listar os leads' })
    }

    const colEv = app.findCollectionByNameOrId('crm_lead_events')
    const colPA = app.findCollectionByNameOrId('precisa_acao')
    var movidos = 0
    var eventos = 0

    for (const l of leads) {
      try {
        l.set('owner_id', para)
        l.set('vendedor_nome', nomePara)
        app.save(l)
        movidos++
        // UM evento por lead, como a SPEC pede
        try {
          const ev = new Record(colEv)
          ev.set('lead_id', l.id)
          ev.set('tipo', 'status')
          ev.set(
            'texto',
            'Carteira passada de ' +
              de.slice(0, 8) +
              ' para ' +
              nomePara +
              ' pela gestão em ' +
              hoje,
          )
          ev.set('user_id', e.auth.id)
          ev.set('fixture', false)
          app.save(ev)
          eventos++
        } catch (eEv) {}
        // resolve o item da fila
        try {
          const itens = app.findRecordsByFilter(
            colPA,
            "lead='" + l.id + "' && resolvido=false",
            '',
            5,
            0,
          )
          for (const it of itens) {
            it.set('resolvido', true)
            it.set('resolvido_em', agoraISO)
            it.set('resolvido_por', e.auth.id)
            it.set('resolvido_para', para)
            app.save(it)
          }
        } catch (ePA) {}
      } catch (e3) {}
    }

    // auditoria da ação em bloco
    try {
      const colA = app.findCollectionByNameOrId('access_audit')
      const a = new Record(colA)
      a.set('at', agoraISO)
      a.set('actor', e.auth.id)
      a.set('acao', 'carteira_passada')
      a.set('alvo', de)
      a.set('detalhe', 'para=' + nomePara + ' leads=' + movidos + ' eventos=' + eventos)
      app.save(a)
    } catch (e4) {}

    return e.json(200, {
      ok: true,
      de: de,
      para: para,
      para_nome: nomePara,
      leads_movidos: movidos,
      eventos: eventos,
    })
  },
  $apis.requireAuth(),
)
