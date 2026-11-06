/// <reference path="../pb_data/types.d.ts" />
/**
 * TELA DE CONVERSÕES — CA-3-65 (SPEC-3-014, 06/11).
 *
 * **O problema que ela resolve:** a venda fecha, a conversão entra na fila e
 * ninguém sabe se chegou na Meta. Se falha, falha em silêncio — o anúncio
 * continua otimizando com dado errado e o dinheiro segue sendo gasto.
 *
 * **O que a tela mostra, por venda:**
 *   - cliente, valor e quando;
 *   - **estado** na Meta (pendente/enviado/erro);
 *   - **o erro legível** quando falhou (código + texto da Meta);
 *   - **reenviar** para os erros, sem duplicar o evento.
 *
 * Rotas:
 *   GET  /backend/v1/crm/conversoes          → lista com estado por plataforma
 *   POST /backend/v1/crm/conversoes/reenviar → {id} volta para a fila
 */
routerAdd(
  'GET',
  '/backend/v1/crm/conversoes',
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

    const out = {
      ok: true,
      total: 0,
      contagem: { pendente: 0, enviado: 0, erro: 0 },
      itens: [],
    }

    var convs = []
    try {
      convs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('conversion_events'),
        'fixture=false',
        '',
        2000,
        0,
      )
    } catch (e1) {
      out.ok = false
      out.erro = String(e1).slice(0, 140)
      return e.json(200, out)
    }

    // nomes dos clientes (uma leitura só)
    const nomesLead = {}
    try {
      for (const l of app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        '',
        '',
        12000,
        0,
      )) {
        nomesLead[l.id] = {
          nome: String(l.get('nome') || ''),
          telefone: String(l.get('telefone') || ''),
        }
      }
    } catch (e2) {}

    // estado "de leitura" a partir do valor gravado
    function rotulo(st) {
      const s = String(st || '').toLowerCase()
      if (s === 'sent' || s === 'enviado') return 'enviado'
      if (s === 'erro' || s === 'error') return 'erro'
      return 'pendente'
    }

    for (const c of convs) {
      const est = rotulo(c.get('estado'))
      out.contagem[est]++
      const leadId = String(c.get('lead_id') || '')
      const info = nomesLead[leadId] || { nome: '', telefone: '' }
      // erro legível: código + texto quando houver
      const err = String(c.get('ultimo_erro') || '')
      out.itens.push({
        id: c.id,
        lead: leadId,
        cliente: info.nome || '(lead apagado)',
        telefone: info.telefone,
        valor: Number(c.get('valor') || 0),
        estado_meta: est,
        estado_google: String(c.get('estado_google') || 'nao_configurado'),
        erro: err.slice(0, 200),
        erro_legivel: err !== '' ? traduzErro(err) : '',
        event_id: String(c.get('event_id') || ''),
        tentativas: Number(c.get('tentativas') || 0),
        enviado_em: String(c.get('enviado_em') || '').slice(0, 16),
        criado: String(c.get('created') || '').slice(0, 16),
      })
    }

    function traduzErro(t) {
      const s = String(t || '')
      if (s.indexOf('401') >= 0 || s.indexOf('403') >= 0) {
        return 'Token recusado pela Meta — precisa renovar o acesso'
      }
      if (s.indexOf('429') >= 0) return 'Limite de envios da Meta — tentando de novo'
      if (s.indexOf('190') >= 0) return 'Token da Meta expirou'
      if (s.indexOf('100') >= 0) return 'A Meta recusou os dados do evento (campo inválido)'
      if (s.indexOf('lead') >= 0) return 'O lead desta venda não existe mais'
      return s
    }

    // mais recentes primeiro
    out.itens.sort(function (a, b) {
      return String(b.criado).localeCompare(String(a.criado))
    })
    out.total = out.itens.length
    return e.json(200, out)
  },
  $apis.requireAuth(),
)

// ==================== REENVIAR ====================
routerAdd(
  'POST',
  '/backend/v1/crm/conversoes/reenviar',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}
    const id = String(body.id || '')
    if (id === '') return e.json(422, { ok: false, erro: 'informe a conversão' })

    var conv = null
    try {
      conv = $app.findRecordById('conversion_events', id)
    } catch (e1) {
      return e.json(404, { ok: false, erro: 'conversão não encontrada' })
    }

    // reenviar NÃO cria evento novo: volta a MESMA conversão para a fila,
    // com o MESMO event_id — assim a Meta deduplica se já tiver recebido.
    try {
      conv.set('estado', 'pending')
      conv.set('tentativas', 0)
      conv.set('ultimo_erro', '')
      $app.save(conv)
    } catch (e2) {
      return e.json(500, { ok: false, erro: 'não consegui reenviar: ' + String(e2).slice(0, 120) })
    }

    return e.json(200, {
      ok: true,
      id: id,
      estado: 'pending',
      event_id: String(conv.get('event_id') || ''),
      aviso: 'voltou para a fila; o envio acontece nos próximos 5 minutos',
    })
  },
  $apis.requireAuth(),
)
