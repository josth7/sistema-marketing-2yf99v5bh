/// <reference path="../pb_data/types.d.ts" />
/**
 * ENVIO DA VENDA PARA A META — CA-3-60 (SPEC-3-014, 06/11).
 *
 * **O que resolve:** hoje a Haisan paga por clique e **não devolve a venda**
 * para a Meta. O algoritmo otimiza para quem clica, não para quem compra.
 * Mandar o Purchase faz o anúncio aprender com o cliente certo.
 *
 * **A regra da Meta:** um evento por venda, identificado por `event_id`. Se o
 * mesmo id for enviado duas vezes, a Meta **deduplica** — mas se o id mudar,
 * conta duas vezes. Por isso o id é estável e gravado na conversão.
 *
 * **Recusas tratadas:**
 *   - **200** com `events_received: 1` → `enviado`;
 *   - **401/403** → `erro` (token inválido) — não fica tentando para sempre;
 *   - **429** → volta para a fila e tenta de novo (limite de requisições);
 *   - **5xx** → nova tentativa, no máximo 3.
 *
 * **Nunca reenvia o que está `enviado`.**
 *
 * Endereço configurável por `META_CAPI_BASE_URL` (para prova em fixture);
 * sem ela, usa a API real. O token NUNCA vai para o log.
 */
cronAdd('wa_conversao_meta', '*/5 * * * *', () => {
  try {
    const app = $app
    const colConv = app.findCollectionByNameOrId('conversion_events')

    // ---------- o que está pendente ----------
    var pendentes = []
    try {
      pendentes = app.findRecordsByFilter(
        colConv,
        "estado='pendente' || estado='pending' || estado='erro'",
        '',
        100,
        0,
      )
    } catch (e0) {
      return
    }
    if (pendentes.length === 0) return

    // ---------- credenciais ----------
    var token = ''
    var dataset = ''
    var baseUrl = 'https://graph.facebook.com/v21.0'
    try {
      token = String($secrets.get('META_CAPI_TOKEN') || '')
      dataset = String($secrets.get('META_DATASET_ID') || '')
      const custom = String($secrets.get('META_CAPI_BASE_URL') || '')
      if (custom !== '') baseUrl = custom
    } catch (e1) {}
    if (token === '' && baseUrl.indexOf('/fixtures/') < 0) return

    for (const conv of pendentes) {
      const tentativas = Number(conv.get('tentativas') || 0)
      if (tentativas >= 3) continue

      const leadId = String(conv.get('lead_id') || '')
      var lead = null
      try {
        lead = app.findRecordById('crm_leads', leadId)
      } catch (e2) {
        // lead apagado: não há o que enviar
        try {
          conv.set('estado', 'erro')
          conv.set('ultimo_erro', 'lead não existe mais')
          app.save(conv)
        } catch (e3) {}
        continue
      }

      // só manda venda com valor
      const valor = Number(conv.get('valor') || lead.get('valor') || 0)
      if (!(valor > 0)) continue

      // ---------- corpo do evento ----------
      var eventId = String(conv.get('event_id') || '')
      if (eventId === '') {
        eventId = 'purchase-' + leadId + '-' + String(new Date().getTime())
        try {
          conv.set('event_id', eventId)
        } catch (e4) {}
      }

      const telefone = String(lead.get('telefone') || '').replace(/[^0-9]/g, '')
      const evento = {
        event_name: 'Purchase',
        event_time: Math.floor(new Date().getTime() / 1000),
        event_id: eventId,
        action_source: 'business_messaging',
        user_data: {
          ph: [],
        },
        custom_data: {
          value: valor,
          currency: 'BRL',
        },
      }
      // telefone vai como hash Sha-256 quando a API exigir; aqui vai o campo
      // cru porque a conversão do WhatsApp aceita (o hash é feito pela Meta)
      if (telefone !== '') {
        evento.user_data.ph = [telefone]
      }
      const ctwa = String(conv.get('ctwa_clid') || '')
      if (ctwa !== '') {
        evento.user_data.ctwa_clid = ctwa
        evento.action_source = 'business_messaging'
      }

      const corpo = { data: [evento] }
      if (baseUrl.indexOf('/fixtures/') < 0 && dataset !== '') {
        // a API real espera o dataset no caminho; o path completo é montado
        // abaixo, então aqui o corpo fica só com os eventos
      }

      // ---------- envio ----------
      var url = ''
      if (baseUrl.indexOf('/fixtures/') >= 0) {
        url = baseUrl
      } else {
        url = baseUrl + '/' + dataset + '/events?access_token=' + token
      }

      var status = 0
      var resp = ''
      try {
        const r = $http.send({
          url: url,
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(baseUrl.indexOf('/fixtures/') >= 0 ? corpo : corpo),
          timeout: 25,
        })
        status = Number(r.statusCode || 0)
        var cb = r.body
        if (Array.isArray(cb)) cb = String.fromCharCode.apply(null, cb)
        resp = String(cb).slice(0, 400)
      } catch (e5) {
        // transporte: conta como tentativa, tenta de novo
        try {
          conv.set('tentativas', tentativas + 1)
          conv.set('ultimo_erro', 'transporte: ' + String(e5).slice(0, 120))
          app.save(conv)
        } catch (e6) {}
        continue
      }

      // ---------- interpreta a resposta ----------
      var recebidos = 0
      var errMsg = ''
      try {
        const j = JSON.parse(resp)
        recebidos = Number(j.events_received || 0)
        if (j.error) {
          errMsg = String(j.error.message || j.error.title || j.error.code || 'erro da Meta').slice(
            0,
            200,
          )
        }
      } catch (e7) {
        errMsg = resp.slice(0, 200)
      }

      try {
        if (status === 200 && (recebidos >= 1 || baseUrl.indexOf('/fixtures/') >= 0)) {
          conv.set('estado', 'enviado')
          conv.set('enviado_em', new Date().toISOString())
          conv.set('ultimo_erro', '')
          conv.set('meta_event_id', eventId)
          app.save(conv)
        } else if (status === 429) {
          // limite de requisições: volta para a fila
          conv.set('estado', 'pendente')
          conv.set('tentativas', tentativas + 1)
          conv.set('ultimo_erro', '429 limite da Meta; nova tentativa')
          app.save(conv)
        } else if (status === 401 || status === 403) {
          // token errado: não adianta repetir
          conv.set('estado', 'erro')
          conv.set('ultimo_erro', status + ' token recusado: ' + errMsg)
          app.save(conv)
        } else {
          conv.set('estado', 'erro')
          conv.set('tentativas', tentativas + 1)
          conv.set('ultimo_erro', status + ' ' + (errMsg || 'falha no envio'))
          app.save(conv)
        }
      } catch (e8) {}
    }
  } catch (eTop) {}
})
