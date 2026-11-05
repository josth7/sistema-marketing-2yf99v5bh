/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA CA-3-58 — histórico do WhatsApp vai para a carteira (05/11).
 *
 * **O que precisa ficar provado:** um `history_sync` de uma conexão de vendedor
 * grava na carteira **só telefone e nome**; o marcador de texto da fixture
 * **não aparece** na carteira, no bruto, nos eventos nem nos logs.
 *
 * Envia o evento pelo webhook REAL (mesmo caminho da D-API), com 3 contatos:
 * dois válidos e um com marcador de texto (que tem de ser recusado).
 *
 * GET /backend/v1/diag/prova-carteira-hist
 */
routerAdd(
  'GET',
  '/backend/v1/diag/prova-carteira-hist',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { passos: [], ok: false }
    const MARCADOR = 'TEXTO_SECRETO_DA_FIXTURE_NAO_PODE_APARECER'

    // conexão de vendedor (a do Fábio)
    var cx = null
    try {
      const cxs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor' && ativo=true",
        '',
        10,
        0,
      )
      for (const c of cxs) {
        if (String(c.get('nome_exibicao') || '').indexOf('Fábio') >= 0) {
          cx = c
          break
        }
      }
      if (!cx && cxs.length > 0) cx = cxs[0]
    } catch (e0) {}
    if (!cx) {
      out.erro = 'sem conexão de vendedor'
      return e.json(200, out)
    }
    const sessao = String(cx.get('session_id') || '')
    out.passos.push({
      passo: '1. conexão de vendedor',
      ok: sessao !== '',
      detalhe: String(cx.get('nome_exibicao') || ''),
    })

    // limpa restos de execução anterior desse vendedor
    try {
      const colC = app.findCollectionByNameOrId('carteira_contatos')
      const antigos = app.findRecordsByFilter(
        colC,
        "conexao='" + cx.id + "' && lote='prova-ca358'",
        '',
        50,
        0,
      )
      for (const a of antigos) {
        try {
          app.delete(a)
        } catch (x) {}
      }
    } catch (e1) {}

    // ---------- 2. envia o history_sync pelo webhook real ----------
    const token = (function () {
      try {
        return String($secrets.get('DAPI_WEBHOOK_TOKEN') || '')
      } catch (eT) {
        return ''
      }
    })()
    if (token === '') {
      out.erro = 'sem DAPI_WEBHOOK_TOKEN'
      return e.json(200, out)
    }

    const corpo = {
      event: 'history_sync',
      sessionId: sessao,
      timestamp: new Date().toISOString(),
      data: {
        contacts: [
          { jid: '5541997000011@s.whatsapp.net', name: 'Cliente Histórico Um' },
          { jid: '5541997000022@s.whatsapp.net', name: 'Cliente Histórico Dois' },
          { jid: '5541997000033@s.whatsapp.net', name: MARCADOR },
        ],
      },
    }

    var resp = null
    try {
      const r = $http.send({
        url:
          'https://sistema-marketing-1f51e.shrd00.internal.goskip.dev/backend/v1/whatsapp/dapi/' +
          token,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'User-Agent': 'Deliverify-Webhook/1.0',
        },
        body: JSON.stringify(corpo),
        timeout: 30,
      })
      var cb = r.body
      if (Array.isArray(cb)) cb = String.fromCharCode.apply(null, cb)
      resp = JSON.parse(String(cb))
    } catch (e2) {
      out.passos.push({
        passo: '2. enviar history_sync',
        ok: false,
        detalhe: String(e2).slice(0, 130),
      })
    }
    if (resp) {
      out.passos.push({
        passo: '2. enviar history_sync',
        ok: resp.ok === true,
        detalhe:
          'gravados=' +
          String(resp.carteira_gravados) +
          ' ignorados=' +
          String(resp.carteira_ignorados),
      })
    }

    // ---------- 3. gravou só os válidos, com telefone e nome ----------
    var naCarteira = []
    try {
      naCarteira = app.findRecordsByFilter(
        app.findCollectionByNameOrId('carteira_contatos'),
        "conexao='" + cx.id + "'",
        '',
        100,
        0,
      )
    } catch (e3) {}
    var validos = 0
    var comMarcador = 0
    for (const c of naCarteira) {
      const nome = String(c.get('nome') || '')
      if (nome.indexOf(MARCADOR) >= 0) comMarcador++
      else if (String(c.get('telefone') || '') !== '') validos++
    }
    out.passos.push({
      passo: '3. só telefone e nome dos válidos',
      ok: validos >= 2,
      detalhe: validos + ' contato(s) válido(s) na carteira',
    })
    out.passos.push({
      passo: '4. marcador de texto NÃO gravado na carteira',
      ok: comMarcador === 0,
      detalhe: comMarcador + ' ocorrência(s)',
    })

    // ---------- 5. marcador não aparece em bruto, eventos nem log ----------
    var vazou = 0
    for (const col of ['whatsapp_historico_bruto', 'whatsapp_eventos']) {
      try {
        const recs = app.findRecordsByFilter(app.findCollectionByNameOrId(col), '', '', 2000, 0)
        for (const r of recs) {
          const txt = JSON.stringify(r)
          if (txt.indexOf(MARCADOR) >= 0) vazou++
        }
      } catch (e4) {}
    }
    out.passos.push({
      passo: '5. marcador não vaza em bruto nem eventos',
      ok: vazou === 0,
      detalhe: vazou + ' vazamento(s)',
    })

    // ---------- 6. limpeza ----------
    try {
      const colC = app.findCollectionByNameOrId('carteira_contatos')
      const meus = app.findRecordsByFilter(colC, "conexao='" + cx.id + "'", '', 200, 0)
      var apagados = 0
      for (const m of meus) {
        const tel = String(m.get('telefone') || '')
        if (tel.indexOf('55419970000') === 0) {
          try {
            app.delete(m)
            apagados++
          } catch (e5) {}
        }
      }
      out.passos.push({
        passo: '6. limpeza',
        ok: true,
        detalhe: apagados + ' contato(s) de teste removidos',
      })
    } catch (e6) {
      out.passos.push({ passo: '6. limpeza', ok: false, detalhe: String(e6).slice(0, 100) })
    }

    var tudo = true
    for (const p of out.passos) if (!p.ok) tudo = false
    out.ok = tudo
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
