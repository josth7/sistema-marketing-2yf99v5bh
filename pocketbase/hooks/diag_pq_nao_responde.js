/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (09/11) — por que a vendedora não consegue responder?
 *
 * **SÓ LEITURA.** A rota permite responder quando:
 *   1. tem `read_conversas` E escopo `*` (gestão);
 *   2. é a vendedora da conexão;
 *   3. a conexão é central e ela é dona do lead;
 *   4. ela está em `leitores` do sinal da conversa.
 *
 * Aqui se testa cada um e mostra o que falta — inclusive se o `reply_conversas`
 * existe no grant dela.
 *
 * GET /backend/v1/diag/pq-nao-responde?conversa=<id>&email=<email>
 */
routerAdd(
  'GET',
  '/backend/v1/diag/pq-nao-responde',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const convId = String(e.request.url.query().get('conversa') || '')
    const email = String(e.request.url.query().get('email') || 'elisangela@haisan.com.br')
    const out = { ok: true, passos: [], pode: false }

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

    var cv = null
    try {
      cv = app.findRecordById('whatsapp_conversas', convId)
    } catch (e0) {
      return e.json(404, { ok: false, erro: 'conversa não encontrada' })
    }
    var user = null
    try {
      const us = app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        "email='" + email + "'",
        '',
        1,
        0,
      )
      if (us.length > 0) user = us[0]
    } catch (e1) {}
    if (!user) return e.json(404, { ok: false, erro: 'usuário não encontrado' })

    out.usuario = String(user.get('name') || '')
    out.conversa = {
      conexao: String(cv.get('conexao') || ''),
      telefone: String(cv.get('contato_telefone') || ''),
      lead: String(cv.get('lead') || ''),
      estado: String(cv.get('estado') || ''),
    }

    // ---------- grant: ações e escopo ----------
    var atos = []
    var escopo = []
    var temReply = false
    var temRead = false
    try {
      const gs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "user_id='" + user.id + "' && revoked_at=''",
        '',
        20,
        0,
      )
      for (const g of gs) {
        const a = lerL(g.get('actions'))
        const sc = lerL(g.get('scope_accounts'))
        if (Array.isArray(a)) {
          for (const x of a) if (atos.indexOf(x) < 0) atos.push(x)
        }
        if (Array.isArray(sc)) {
          for (const x of sc) if (escopo.indexOf(x) < 0) escopo.push(x)
        }
      }
      temReply = atos.indexOf('reply_conversas') >= 0
      temRead = atos.indexOf('read_conversas') >= 0
    } catch (e2) {}
    out.acoes = atos
    out.escopo = escopo
    out.passos.push({
      passo: '1. tem reply_conversas',
      ok: temReply,
      detalhe: temReply ? 'sim' : 'NÃO — é a trava do CA-3-50',
    })
    out.passos.push({
      passo: '2. tem read_conversas',
      ok: temRead,
      detalhe: temRead ? 'sim' : 'não',
    })

    // ---------- conexão ----------
    var papel = ''
    var vendedorCx = ''
    try {
      const cx = app.findRecordById('whatsapp_conexoes', out.conversa.conexao)
      papel = String(cx.get('papel') || '')
      vendedorCx = String(cx.get('vendedor_user') || '')
      out.conexao = { nome: String(cx.get('nome_exibicao') || ''), papel: papel }
    } catch (e3) {}
    out.passos.push({
      passo: '3. é vendedor da conexão',
      ok: papel === 'vendedor' && vendedorCx === user.id,
      detalhe: 'papel=' + papel,
    })

    // ---------- dono do lead ----------
    var ehDono = false
    if (out.conversa.lead !== '') {
      try {
        const l = app.findRecordById('crm_leads', out.conversa.lead)
        ehDono = String(l.get('owner_id') || '') === user.id
        out.lead = { nome: String(l.get('nome') || ''), dono: String(l.get('owner_id') || '') }
      } catch (e4) {}
    }
    out.passos.push({
      passo: '4. é dono do lead',
      ok: ehDono,
      detalhe: out.conversa.lead === '' ? 'conversa SEM lead' : String(ehDono),
    })

    // ---------- leitores do sinal ----------
    var emLeitores = false
    try {
      const sins = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_sinais'),
        "conversa='" + convId + "'",
        '',
        1,
        0,
      )
      if (sins.length > 0) {
        const leit = lerL(sins[0].get('leitores'))
        emLeitores = Array.isArray(leit) && leit.indexOf(user.id) >= 0
        out.leitores = leit.length
      }
    } catch (e5) {}
    out.passos.push({
      passo: '5. está em leitores do sinal',
      ok: emLeitores,
      detalhe: String(emLeitores),
    })

    out.pode =
      temReply && (ehDono || emLeitores || (papel === 'vendedor' && vendedorCx === user.id))
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
