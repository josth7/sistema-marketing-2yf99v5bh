/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (06/11) — as 9 conversas que o Fábio não vê.
 *
 * Para cada uma: qual lead está vinculado, quem é o dono, e se o Fábio está
 * nos `leitores` do sinal. Assim se descobre o que difere das 48 que ele vê.
 *
 * GET /backend/v1/diag/as-9-faltando
 */
routerAdd(
  'GET',
  '/backend/v1/diag/as-9-faltando',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const EMAIL = 'fabio@haisan.com.br'
    var user = null
    try {
      const us = app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        "email='" + EMAIL + "'",
        '',
        1,
        0,
      )
      if (us.length > 0) user = us[0]
    } catch (e0) {}
    if (!user) return e.json(404, { ok: false, erro: 'usuário não encontrado' })

    const out = { ok: true, itens: [], resumo: {} }

    // conversas cuja última mensagem é do cliente, na central, não fixture
    var convs = []
    try {
      convs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "fixture=false && ultimo_autor='cliente'",
        '',
        3000,
        0,
      )
    } catch (e1) {
      return e.json(200, { ok: false, erro: String(e1).slice(0, 140) })
    }

    var naoVe = 0
    var ve = 0
    for (const cv of convs) {
      var lead = null
      const leadId = String(cv.get('lead') || '')
      if (leadId !== '') {
        try {
          lead = app.findRecordById('crm_leads', leadId)
        } catch (e2) {}
      }
      const dono = lead ? String(lead.get('owner_id') || '') : ''
      const ehDono = dono === user.id

      // leitores do sinal
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

      if (ehDono) ve++
      else if (emLeitores) ve++
      else {
        naoVe++
        if (out.itens.length < 12) {
          out.itens.push({
            conv: cv.id,
            telefone: String(cv.get('contato_telefone') || ''),
            lead_id: leadId,
            dono_id: dono,
            eh_dono: ehDono,
            em_leitores: emLeitores,
            leitores: leitores.length,
            tem_lead: leadId !== '',
            tem_sinal: leitores.length > 0 || (leadId === '' ? false : true),
            estado: String(cv.get('estado') || ''),
          })
        }
      }
    }
    out.resumo = { total_cliente_por_ultimo: convs.length, ve: ve, nao_ve: naoVe }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
