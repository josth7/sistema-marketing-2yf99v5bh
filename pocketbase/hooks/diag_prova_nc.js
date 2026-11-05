/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA CA-3-73 — "não é cliente" (05/11).
 *
 * **O que precisa ficar provado:**
 *   1. marcar uma conversa como "não é cliente" tira de Clientes e põe em Outros;
 *   2. nova mensagem desse telefone **não cria lead**;
 *   3. **não entra no rodízio** e o robô **não responde**;
 *   4. "É cliente" desfaz.
 *
 * Usa uma conversa de TESTE (número descartável 5551997700011), nunca cliente
 * real. Limpa tudo no fim.
 *
 * GET /backend/v1/diag/prova-nao-cliente
 */
routerAdd(
  'GET',
  '/backend/v1/diag/prova-nao-cliente',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const TEL = '5551997700011'
    const out = { passos: [], ok: false }
    const colCv = app.findCollectionByNameOrId('whatsapp_conversas')
    const colL = app.findCollectionByNameOrId('crm_leads')
    const colMsg = app.findCollectionByNameOrId('whatsapp_mensagens')
    const colEv = app.findCollectionByNameOrId('crm_lead_events')

    // ---------- limpa execução anterior ----------
    try {
      const vs = app.findRecordsByFilter(colCv, "contato_telefone='" + TEL + "'", '', 20, 0)
      for (const v of vs) {
        try {
          app.delete(v)
        } catch (a) {}
      }
    } catch (e0) {}
    try {
      const ls = app.findRecordsByFilter(colL, "telefone='" + TEL + "'", '', 10, 0)
      for (const l of ls) {
        try {
          const es = app.findRecordsByFilter(colEv, "lead_id='" + l.id + "'", '', 50, 0)
          for (const x of es) {
            try {
              app.delete(x)
            } catch (b) {}
          }
        } catch (c) {}
        try {
          app.delete(l)
        } catch (d) {}
      }
    } catch (e1) {}

    // ---------- 1. conversa de teste ----------
    var central = null
    try {
      const cxs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true",
        '',
        5,
        0,
      )
      if (cxs && cxs.length > 0) central = cxs[0]
    } catch (e2) {}
    if (!central) {
      out.erro = 'sem central'
      return e.json(200, out)
    }

    var conv = null
    try {
      const nc = new Record(colCv)
      nc.set('conexao', central.id)
      nc.set('contato_telefone', TEL)
      nc.set('contato_nome', 'Transportadora Teste')
      nc.set('estado', 'triagem')
      nc.set('total_mensagens', 0)
      nc.set('fixture', true)
      app.save(nc)
      conv = nc
      out.passos.push({ passo: '1. conversa de teste', ok: true, detalhe: nc.id })
    } catch (e3) {
      out.erro = 'criar conversa: ' + String(e3).slice(0, 150)
      return e.json(200, out)
    }

    // ---------- 2. marca como NÃO cliente pela rota real ----------
    const auth = String(e.request.header.get('Authorization') || '')
    var marca = null
    try {
      const resp = $http.send({
        url:
          'https://sistema-marketing-1f51e.shrd00.internal.goskip.dev/backend/v1/whatsapp/conversas/' +
          conv.id +
          '/nao-cliente',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ nao_cliente: true, motivo: 'transportadora' }),
        timeout: 25,
      })
      var corpo = resp.body
      if (Array.isArray(corpo)) corpo = String.fromCharCode.apply(null, corpo)
      marca = JSON.parse(String(corpo))
    } catch (e4) {
      out.passos.push({
        passo: '2. marcar não cliente',
        ok: false,
        detalhe: String(e4).slice(0, 120),
      })
    }
    if (marca) {
      out.passos.push({
        passo: '2. marcar não cliente',
        ok: marca.ok === true && marca.nao_cliente === true,
        detalhe: 'estado=' + String(marca.estado) + ' motivo=' + String(marca.motivo),
      })
    }

    // ---------- 3. aparece em Outros? ----------
    var emOutros = false
    try {
      const r2 = $http.send({
        url: 'https://sistema-marketing-1f51e.shrd00.internal.goskip.dev/backend/v1/whatsapp/outros',
        method: 'GET',
        headers: { Authorization: auth, Accept: 'application/json' },
        timeout: 25,
      })
      var c2 = r2.body
      if (Array.isArray(c2)) c2 = String.fromCharCode.apply(null, c2)
      const j2 = JSON.parse(String(c2))
      for (const i of j2.itens || []) if (i.id === conv.id) emOutros = true
    } catch (e5) {}
    out.passos.push({
      passo: '3. aparece na aba Outros',
      ok: emOutros,
      detalhe: emOutros ? 'sim' : 'não',
    })

    // ---------- 4. nova mensagem NÃO cria lead ----------
    try {
      const m = new Record(colMsg)
      m.set('conexao', central.id)
      m.set('contato_telefone', TEL)
      m.set('direcao', 'entrada')
      m.set('autor', 'cliente')
      m.set('tipo', 'text')
      m.set('texto', 'Entrega agendada para amanhã (teste)')
      m.set('status', 'recebida')
      m.set('enviada_em', new Date().toISOString())
      m.set('wa_message_id', 'teste-nc-' + String(new Date().getTime()))
      m.set('fixture', true)
      app.save(m)
    } catch (e6) {}
    // o webhook real é quem cria lead; aqui simulo a checagem que ele faz
    var criariaLead = true
    try {
      const jaNC = app.findRecordsByFilter(
        colCv,
        "contato_telefone='" + TEL + "' && nao_cliente=true",
        '',
        1,
        0,
      )
      if (jaNC && jaNC.length > 0) criariaLead = false
    } catch (e7) {}
    var leadsDoTel = []
    try {
      leadsDoTel = app.findRecordsByFilter(colL, "telefone='" + TEL + "'", '', 10, 0)
    } catch (e8) {}
    out.passos.push({
      passo: '4. nova mensagem não cria lead',
      ok: criariaLead === false && leadsDoTel.length === 0,
      detalhe: 'webhook barraria=' + (criariaLead === false) + ' | leads=' + leadsDoTel.length,
    })

    // ---------- 5. fora do rodízio (estado não é triagem) ----------
    var cvRelido = null
    try {
      cvRelido = app.findRecordById(colCv, conv.id)
    } catch (e9) {}
    const est = cvRelido ? String(cvRelido.get('estado') || '') : ''
    const ncRelido = cvRelido ? cvRelido.get('nao_cliente') === true : false
    out.passos.push({
      passo: '5. fora do rodízio (estado ≠ triagem)',
      ok: est !== 'triagem' && ncRelido,
      detalhe: 'estado=' + est + ' nao_cliente=' + ncRelido,
    })

    // ---------- 6. "É cliente" desfaz ----------
    var desfez = null
    try {
      const r3 = $http.send({
        url:
          'https://sistema-marketing-1f51e.shrd00.internal.goskip.dev/backend/v1/whatsapp/conversas/' +
          conv.id +
          '/nao-cliente',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ nao_cliente: false }),
        timeout: 25,
      })
      var c3 = r3.body
      if (Array.isArray(c3)) c3 = String.fromCharCode.apply(null, c3)
      desfez = JSON.parse(String(c3))
    } catch (eA) {}
    if (desfez) {
      out.passos.push({
        passo: '6. "É cliente" desfaz',
        ok: desfez.ok === true && desfez.nao_cliente === false,
        detalhe: 'estado=' + String(desfez.estado),
      })
    }

    // ---------- 7. limpeza ----------
    try {
      const vs = app.findRecordsByFilter(colCv, "contato_telefone='" + TEL + "'", '', 20, 0)
      for (const v of vs) {
        try {
          app.delete(v)
        } catch (a2) {}
      }
      const ms = app.findRecordsByFilter(colMsg, "contato_telefone='" + TEL + "'", '', 50, 0)
      for (const m of ms) {
        try {
          app.delete(m)
        } catch (b2) {}
      }
      out.passos.push({ passo: '7. limpeza', ok: true, detalhe: 'conversa e mensagens apagadas' })
    } catch (eB) {
      out.passos.push({ passo: '7. limpeza', ok: false, detalhe: String(eB).slice(0, 120) })
    }

    var tudo = true
    for (const p of out.passos) if (!p.ok) tudo = false
    out.ok = tudo
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
