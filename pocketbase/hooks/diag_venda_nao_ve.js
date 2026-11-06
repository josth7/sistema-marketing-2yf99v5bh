/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (06/11) — por que o vendedor não vê a conversa do próprio lead?
 *
 * Caso real: lead "Geo" é do Fábio, a conversa está na central e **ele não a vê**.
 * A rota de conversas permite ver quando: é o dono do lead, OU está em
 * `leitores` do sinal, OU é o vendedor da conexão.
 *
 * Aqui se testa cada uma das três para achar onde a regra falha.
 *
 * GET /backend/v1/diag/venda-nao-ve?conversa=<id>&email=<email>
 */
routerAdd(
  'GET',
  '/backend/v1/diag/venda-nao-ve',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const convId = String(e.request.url.query().get('conversa') || '')
    const email = String(e.request.url.query().get('email') || 'fabio@haisan.com.br')
    const out = { ok: true, passos: [], posso: false }

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

    out.conversa = {
      id: cv.id,
      conexao: String(cv.get('conexao') || ''),
      telefone: String(cv.get('contato_telefone') || ''),
      lead: String(cv.get('lead') || ''),
      estado: String(cv.get('estado') || ''),
      ultimo_autor: String(cv.get('ultimo_autor') || ''),
    }
    out.usuario = { id: user.id, nome: String(user.get('name') || '') }

    // 1. é o dono do lead?
    var ehDono = false
    if (out.conversa.lead !== '') {
      try {
        const l = app.findRecordById('crm_leads', out.conversa.lead)
        ehDono = String(l.get('owner_id') || '') === user.id
        out.lead = {
          nome: String(l.get('nome') || ''),
          dono_id: String(l.get('owner_id') || ''),
          status: String(l.get('status') || ''),
        }
      } catch (e2) {
        out.lead = { erro: 'lead não encontrado' }
      }
    } else {
      out.lead = { erro: 'conversa SEM lead vinculado' }
    }
    out.passos.push({ passo: '1. é dono do lead', ok: ehDono, detalhe: String(ehDono) })

    // 2. está em leitores do sinal?
    var emLeitores = false
    var leitores = []
    try {
      const sins = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_sinais'),
        "conversa='" + cv.id + "'",
        '',
        1,
        0,
      )
      if (sins.length > 0) {
        const raw = sins[0].get('leitores')
        leitores =
          Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number'
            ? JSON.parse(String.fromCharCode.apply(null, raw))
            : typeof raw === 'string'
              ? JSON.parse(raw)
              : raw || []
        emLeitores = Array.isArray(leitores) && leitores.indexOf(user.id) >= 0
      }
    } catch (e3) {}
    out.passos.push({
      passo: '2. está em leitores do sinal',
      ok: emLeitores,
      detalhe: leitores.length + ' leitores' + (sins === undefined ? '' : ''),
    })

    // 3. é o vendedor da conexão?
    var ehVendCx = false
    try {
      const cx = app.findRecordById('whatsapp_conexoes', out.conversa.conexao)
      ehVendCx = String(cx.get('vendedor_user') || '') === user.id
      out.conexao = {
        nome: String(cx.get('nome_exibicao') || ''),
        papel: String(cx.get('papel') || ''),
        vendedor_user: String(cx.get('vendedor_user') || ''),
      }
    } catch (e4) {}
    out.passos.push({ passo: '3. é vendedor da conexão', ok: ehVendCx, detalhe: String(ehVendCx) })

    // 4. qual dos três daria acesso
    out.posso = ehDono || emLeitores || ehVendCx
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
