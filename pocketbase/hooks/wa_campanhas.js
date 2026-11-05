/// <reference path="../pb_data/types.d.ts" />
/**
 * CAMPANHAS — CA-3-53 (SPEC-3-012, 05/11).
 *
 * **A aba Automações** cria a campanha e mostra a prévia antes de qualquer
 * envio. Nada sai sem aprovação da gestão.
 *
 * **Decisões do dono (05/11):**
 *   - **só a gestão** cria campanha;
 *   - **teto de 200 por dia** por número (padrão; pode ser menor, nunca maior
 *     sem ordem dele);
 *   - ritmo **20 por hora** como padrão da SPEC.
 *
 * **A prévia (o que ela conta, e por que cada número importa):**
 *   - total de contatos da base
 *   - menos **opt-out** (quem pediu para sair — nunca recebe)
 *   - menos **números internos** (a própria equipe)
 *   - menos **duplicados** (mesmo telefone duas vezes)
 *   - menos **importados frios** (contato que veio da planilha e nunca
 *     conversou — mandar propaganda para quem nunca falou é o caminho mais
 *     curto para o número ser bloqueado)
 *   - **5 exemplos** para a gestão ver quem vai receber
 *   - **duração estimada** pelo ritmo
 *
 * Rotas:
 *   POST /backend/v1/campanhas                → cria (rascunho)
 *   GET  /backend/v1/campanhas/{id}/previa    → conta e mostra
 *   POST /backend/v1/campanhas/{id}/aprovar   → aprova (obrigatório p/ iniciar)
 *   POST /backend/v1/campanhas/{id}/pausar    → pausa na hora
 *   GET  /backend/v1/campanhas                → lista
 *
 * JSVM: helpers INLINE.
 */
routerAdd(
  'POST',
  '/backend/v1/campanhas',
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

    // ---------- TRAVA: só a gestão cria campanha (decisão do dono) ----------
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
        const ate = String(g.get('valid_until') || '')
        if (ate !== '' && ate.slice(0, 10) < hoje) continue
        const esc = lerL(g.get('scope_accounts'))
        if (Array.isArray(esc) && esc.indexOf('*') >= 0) ehGestao = true
      }
    } catch (e0) {}
    if (!ehGestao) {
      return e.json(403, {
        ok: false,
        erro: 'só a gestão cria campanha',
        detalhe: 'decisão de 05/11: vendedor não dispara mensagem em massa',
      })
    }

    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}

    const nome = String(body.nome || '')
      .trim()
      .slice(0, 120)
    const conexaoId = String(body.conexao || '')
    const modelo = String(body.modelo_nome || '')
      .trim()
      .slice(0, 120)
    if (nome === '') return e.json(422, { ok: false, erro: 'informe o nome da campanha' })
    if (conexaoId === '') return e.json(422, { ok: false, erro: 'escolha o número que envia' })
    if (modelo === '') {
      return e.json(422, {
        ok: false,
        erro: 'escolha um modelo aprovado',
        detalhe: 'fora da janela de 24h a Meta só aceita modelo aprovado',
      })
    }

    // ---------- teto: 200/dia (decisão do dono), ritmo 20/h (SPEC) ----------
    const tetoPedido = Number(body.teto_dia || 200)
    const teto = tetoPedido > 200 ? 200 : tetoPedido
    const ritmoPedido = Number(body.ritmo_hora || 20)
    const ritmo = ritmoPedido > 20 ? 20 : ritmoPedido

    var conexao = null
    try {
      conexao = app.findRecordById('whatsapp_conexoes', conexaoId)
    } catch (e1) {
      return e.json(404, { ok: false, erro: 'conexão não encontrada' })
    }

    try {
      const col = app.findCollectionByNameOrId('campanhas')
      const c = new Record(col)
      c.set('nome', nome)
      c.set('conexao', conexaoId)
      c.set('modelo_nome', modelo)
      c.set('imagem_url', String(body.imagem_url || '').slice(0, 500))
      c.set('filtros', JSON.stringify(body.filtros || {}).slice(0, 2000))
      c.set('ritmo_hora', ritmo)
      c.set('teto_dia', teto)
      c.set('estado', 'rascunho')
      c.set('criada_por', e.auth.id)
      c.set('fixture', false)
      if (String(body.inicio_em || '') !== '') {
        c.set('inicio_em', String(body.inicio_em))
      }
      app.save(c)
      return e.json(200, {
        ok: true,
        id: c.id,
        nome: nome,
        estado: 'rascunho',
        ritmo_hora: ritmo,
        teto_dia: teto,
        aviso: 'rascunho criado — ver a prévia e aprovar antes de iniciar',
      })
    } catch (e2) {
      return e.json(500, { ok: false, erro: 'não consegui criar: ' + String(e2).slice(0, 140) })
    }
  },
  $apis.requireAuth(),
)

// ==================== PRÉVIA ====================
routerAdd(
  'GET',
  '/backend/v1/campanhas/{id}/previa',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    const app = $app
    const out = {
      ok: true,
      total_base: 0,
      opt_out: 0,
      internos: 0,
      duplicados: 0,
      frios: 0,
      receberao: 0,
      exemplos: [],
      duracao_horas: 0,
      ritmo_hora: 0,
      teto_dia: 0,
    }

    var camp = null
    try {
      camp = app.findRecordById('campanhas', String(e.request.pathValue('id') || ''))
    } catch (e0) {
      return e.json(404, { ok: false, erro: 'campanha não encontrada' })
    }
    out.estado = String(camp.get('estado') || '')
    out.ritmo_hora = Number(camp.get('ritmo_hora') || 20)
    out.teto_dia = Number(camp.get('teto_dia') || 200)

    // ---------- opt-out ----------
    const fora = {}
    try {
      const oos = app.findRecordsByFilter(app.findCollectionByNameOrId('opt_out'), '', '', 8000, 0)
      for (const o of oos) {
        fora[String(o.get('telefone') || '').replace(/\D/g, '')] = true
      }
    } catch (e1) {}

    // ---------- números internos ----------
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
    } catch (e2) {}

    // ---------- quem já conversou (para separar "frio") ----------
    const conversou = {}
    try {
      const msgs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "direcao='entrada'",
        '',
        8000,
        0,
      )
      for (const m of msgs) {
        const t = String(m.get('contato_telefone') || '').replace(/\D/g, '')
        if (t !== '') conversou[t] = true
      }
    } catch (e3) {}

    // ---------- base ----------
    var leads = []
    try {
      leads = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        8000,
        0,
      )
    } catch (e4) {
      out.ok = false
      out.erro = String(e4).slice(0, 140)
      return e.json(200, out)
    }
    out.total_base = leads.length

    const vistos = {}
    for (const l of leads) {
      const tel = String(l.get('telefone') || '').replace(/\D/g, '')
      if (tel === '') continue
      if (fora[tel]) {
        out.opt_out++
        continue
      }
      if (internos[tel]) {
        out.internos++
        continue
      }
      if (vistos[tel]) {
        out.duplicados++
        continue
      }
      // importado frio: veio da planilha e nunca mandou mensagem
      if (!conversou[tel]) {
        out.frios++
        continue
      }
      vistos[tel] = true
      out.receberao++
      if (out.exemplos.length < 5) {
        out.exemplos.push({
          nome: String(l.get('nome') || ''),
          telefone: tel,
          status: String(l.get('status') || ''),
        })
      }
    }

    // duração: quantas horas no ritmo escolhido
    if (out.ritmo_hora > 0) {
      out.duracao_horas = Math.ceil(out.receberao / out.ritmo_hora)
    }
    out.teto_por_dia = out.teto_dia
    out.dias_estimados = out.teto_dia > 0 ? Math.ceil(out.receberao / out.teto_dia) : 0
    return e.json(200, out)
  },
  $apis.requireAuth(),
)

// ==================== APROVAR ====================
routerAdd(
  'POST',
  '/backend/v1/campanhas/{id}/aprovar',
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
        const ate = String(g.get('valid_until') || '')
        if (ate !== '' && ate.slice(0, 10) < hoje) continue
        const esc = lerA(g.get('scope_accounts'))
        if (Array.isArray(esc) && esc.indexOf('*') >= 0) ehGestao = true
      }
    } catch (e0) {}
    if (!ehGestao) return e.json(403, { ok: false, erro: 'só a gestão aprova campanha' })

    var camp = null
    try {
      camp = app.findRecordById('campanhas', String(e.request.pathValue('id') || ''))
    } catch (e1) {
      return e.json(404, { ok: false, erro: 'campanha não encontrada' })
    }

    const estado = String(camp.get('estado') || '')
    if (estado !== 'rascunho' && estado !== 'pausada') {
      return e.json(409, {
        ok: false,
        erro: 'esta campanha não está em rascunho',
        estado: estado,
      })
    }

    try {
      camp.set('estado', 'aprovada')
      camp.set('aprovada_em', new Date().toISOString())
      camp.set('aprovada_por', e.auth.id)
      app.save(camp)
    } catch (e2) {
      return e.json(500, { ok: false, erro: 'não consegui aprovar: ' + String(e2).slice(0, 140) })
    }

    return e.json(200, { ok: true, id: camp.id, estado: 'aprovada' })
  },
  $apis.requireAuth(),
)

// ==================== PAUSAR ====================
routerAdd(
  'POST',
  '/backend/v1/campanhas/{id}/pausar',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    // `app` PRECISA ser declarado aqui: sem isto o `findRecordById` lança
    // ReferenceError, o catch o transforma em "campanha não encontrada" e a
    // pausa nunca funciona — foi o que a prova pegou (05/11).
    const app = $app
    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}
    var camp = null
    try {
      camp = app.findRecordById('campanhas', String(e.request.pathValue('id') || ''))
    } catch (e0) {
      return e.json(404, { ok: false, erro: 'campanha não encontrada' })
    }
    try {
      camp.set('estado', 'pausada')
      camp.set('pausada_em', new Date().toISOString())
      camp.set('pausada_motivo', String(body.motivo || 'pausada pela gestão').slice(0, 200))
      app.save(camp)
    } catch (e1) {
      return e.json(500, { ok: false, erro: String(e1).slice(0, 140) })
    }
    return e.json(200, { ok: true, id: camp.id, estado: 'pausada' })
  },
  $apis.requireAuth(),
)

// ==================== LISTAR ====================
routerAdd(
  'GET',
  '/backend/v1/campanhas',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    const out = { ok: true, total: 0, itens: [] }
    var camps = []
    try {
      camps = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('campanhas'),
        'fixture=false',
        '',
        200,
        0,
      )
    } catch (e0) {
      out.ok = false
      out.erro = String(e0).slice(0, 140)
      return e.json(200, out)
    }
    for (const c of camps) {
      out.itens.push({
        id: c.id,
        nome: String(c.get('nome') || ''),
        estado: String(c.get('estado') || ''),
        ritmo_hora: Number(c.get('ritmo_hora') || 0),
        teto_dia: Number(c.get('teto_dia') || 0),
        criado: String(c.get('created') || '').slice(0, 16),
      })
    }
    out.itens.sort(function (a, b) {
      return String(b.criado).localeCompare(String(a.criado))
    })
    out.total = out.itens.length
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
