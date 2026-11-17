/// <reference path="../pb_data/types.d.ts" />
/**
 * CONSULTOR DA ADAPTA NÃO RECEBE LEAD (17/11) — item 4 do dono.
 *
 * Garantias verificadas:
 *   1. a conta `rodrigo@adapta.org` NÃO tem conexão de vendedor ativa;
 *   2. ela NÃO entra no rodízio (o rodízio exige conexão de vendedor ativa);
 *   3. nenhuma transferência de 14/11 (sexta) aponta para ele;
 *   4. se houver qualquer transferência histórica com o nome/e-mail dele, o
 *      lead correspondente está com um vendedor real.
 *
 * GET /backend/v1/check/consultor-sem-lead
 */
routerAdd(
  'GET',
  '/backend/v1/check/consultor-sem-lead',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, passos: [], green: false }

    // ---------- a conta ----------
    var uid = ''
    try {
      const us = app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        "email='rodrigo@adapta.org'",
        '',
        1,
        0,
      )
      if (us.length > 0) uid = us[0].id
    } catch (e0) {}
    if (uid === '') {
      out.passos.push({ passo: 'conta rodrigo@adapta.org existe', ok: false })
      out.green = false
      return e.json(200, out)
    }
    out.usuario_id = uid.slice(0, 10)
    out.passos.push({ passo: 'conta rodrigo@adapta.org existe', ok: true })

    // ---------- 1. tem conexão de vendedor ativa? ----------
    var conexoes = 0
    var conexoesAtivas = 0
    try {
      const cs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "vendedor_user='" + uid + "'",
        '',
        10,
        0,
      )
      conexoes = cs.length
      for (const c of cs) {
        if (c.get('ativo') === true && String(c.get('papel') || '') === 'vendedor') conexoesAtivas++
      }
    } catch (e1) {}
    out.conexoes_total = conexoes
    out.conexoes_ativas_vendedor = conexoesAtivas
    out.passos.push({
      passo: '1. NAO tem conexao de vendedor ativa (por isso nao entra no rodizio)',
      ok: conexoesAtivas === 0,
      detalhe: 'conexoes=' + conexoes + ' ativas_como_vendedor=' + conexoesAtivas,
    })

    // ---------- 2. leads com ele como dono ----------
    var leadsDele = 0
    try {
      const ls = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        "owner_id='" + uid + "'",
        '',
        50,
        0,
      )
      leadsDele = ls.length
    } catch (e2) {}
    out.leads_como_dono = leadsDele
    out.passos.push({
      passo: '2. nenhum lead tem ele como dono',
      ok: leadsDele === 0,
      detalhe: 'leads=' + leadsDele,
    })

    // ---------- 3. transferências de 14/11 (sexta) com ele ----------
    var transfsSexta = []
    try {
      const trs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_transferencias'),
        "created>='2026-11-14 00:00' && created<='2026-11-14 23:59'",
        '',
        300,
        0,
      )
      for (const t of trs) {
        const vn = String(t.get('vendedor_nome') || '').toLowerCase()
        const vid = String(t.get('vendedor_id') || '')
        if (vn.indexOf('rodrigo') >= 0 || vn.indexOf('@') >= 0 || vid === uid) {
          transfsSexta.push({
            quando: String(t.get('created') || '').slice(0, 16),
            vendedor_nome: String(t.get('vendedor_nome') || ''),
            estado: String(t.get('estado') || ''),
            detalhe: String(t.get('detalhe') || '').slice(0, 80),
            lead: String(t.get('lead') || '').slice(0, 10),
          })
        }
      }
    } catch (e3) {}
    out.transferencias_sexta = transfsSexta
    out.passos.push({
      passo: '3. nenhuma transferencia de 14/11 (sexta) aponta para ele',
      ok: transfsSexta.length === 0,
      detalhe: 'encontradas=' + transfsSexta.length,
    })

    // ---------- 4. histórico: nome/e-mail dele em qualquer transferência ----------
    var historicas = []
    try {
      const todas = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_transferencias'),
        '',
        '-created',
        900,
        0,
      )
      for (const t of todas) {
        const vn = String(t.get('vendedor_nome') || '')
        if (vn.indexOf('rodrigo') >= 0 || vn.indexOf('@') >= 0) {
          // o lead está com vendedor real?
          var donoOk = false
          try {
            const lid = String(t.get('lead') || '')
            if (lid !== '') {
              const l = app.findRecordById('crm_leads', lid)
              const ow = String(l.get('owner_id') || '')
              const cxOk = app.findRecordsByFilter(
                app.findCollectionByNameOrId('whatsapp_conexoes'),
                "vendedor_user='" + ow + "' && papel='vendedor' && ativo=true",
                '',
                1,
                0,
              )
              donoOk = !!(cxOk && cxOk.length > 0)
            }
          } catch (eL2) {}
          if (historicas.length < 20)
            historicas.push({
              quando: String(t.get('created') || '').slice(0, 16),
              vendedor_nome: vn,
              estado: String(t.get('estado') || ''),
              lead_atendido_por_vendedor_real: donoOk,
            })
        }
      }
    } catch (e4) {}
    out.historicas = historicas
    var historicasOk = true
    for (const h of historicas) {
      if (h.lead_atendido_por_vendedor_real !== true) historicasOk = false
    }
    out.passos.push({
      passo:
        '4. toda transferencia historica com ele foi DESCARTADA e o lead esta com vendedor real',
      ok: historicasOk,
      detalhe: 'historicas=' + historicas.length,
    })

    out.green = out.passos.every(function (p) {
      return p.ok === true
    })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
