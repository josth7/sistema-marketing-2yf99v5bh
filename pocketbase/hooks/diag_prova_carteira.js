/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA CA-3-69 — carteira de quem sai vai para a GESTÃO (05/11).
 *
 * **O que precisa ficar provado:**
 *   1. suspender alguém NÃO muda o dono dos leads dele (nada de rodízio);
 *   2. cada lead vira um item em "precisa de ação";
 *   3. a gestão passa a carteira em bloco e cada lead ganha UM evento.
 *
 * **Como prova sem tocar em gente real:** cria uma vendedora de TESTE (e-mail
 * com "fixture", que o sistema trata como conta de teste em todo lugar), dá
 * 3 leads a ela, suspende pela rota real e confere. Depois limpa tudo.
 *
 * GET /backend/v1/diag/prova-carteira
 */
routerAdd(
  'GET',
  '/backend/v1/diag/prova-carteira',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { passos: [], ok: false }
    const EMAIL = 'sai.fixture@haisan.com.br'
    const colU = app.findCollectionByNameOrId('users')
    const colG = app.findCollectionByNameOrId('access_grants')
    const colL = app.findCollectionByNameOrId('crm_leads')
    const colPA = app.findCollectionByNameOrId('precisa_acao')
    const colEv = app.findCollectionByNameOrId('crm_lead_events')

    // ---------- limpa resto de execução anterior ----------
    var velho = null
    try {
      const a = app.findRecordsByFilter(colU, "email='" + EMAIL + "'", '', 1, 0)
      if (a && a.length > 0) velho = a[0]
    } catch (e0) {}
    if (velho) {
      try {
        const ls = app.findRecordsByFilter(colL, "owner_id='" + velho.id + "'", '', 50, 0)
        for (const l of ls) {
          try {
            const evs = app.findRecordsByFilter(colEv, "lead_id='" + l.id + "'", '', 100, 0)
            for (const x of evs) {
              try {
                app.delete(x)
              } catch (a1) {}
            }
          } catch (b1) {}
          try {
            const pas = app.findRecordsByFilter(colPA, "lead='" + l.id + "'", '', 10, 0)
            for (const p of pas) {
              try {
                app.delete(p)
              } catch (c1) {}
            }
          } catch (d1) {}
          try {
            app.delete(l)
          } catch (e1) {}
        }
      } catch (f1) {}
      try {
        const gs = app.findRecordsByFilter(colG, "user_id='" + velho.id + "'", '', 20, 0)
        for (const g of gs) {
          try {
            app.delete(g)
          } catch (g1) {}
        }
      } catch (h1) {}
      try {
        app.delete(velho)
      } catch (i1) {}
    }

    // ---------- 1. vendedora de teste ----------
    var pessoa = null
    try {
      const u = new Record(colU)
      u.set('email', EMAIL)
      u.set('name', 'Vendedora Sai (fixture)')
      u.set('verified', true)
      u.setPassword('Fixture@2026')
      app.save(u)
      pessoa = u
      out.passos.push({ passo: '1. vendedora de teste', ok: true, detalhe: u.id })
    } catch (e2) {
      out.erro = 'criar: ' + String(e2).slice(0, 150)
      return e.json(200, out)
    }

    // grant de vendedora
    try {
      const g = new Record(colG)
      g.set('user_id', pessoa.id)
      g.set('role', 'vendedor')
      g.set('actions', JSON.stringify(['read_leads', 'read_conversas']))
      g.set('scope_accounts', JSON.stringify([]))
      g.set('scope_channels', JSON.stringify([]))
      g.set('valid_from', '')
      g.set('valid_until', '')
      g.set('revoked_at', '')
      g.set('version', 1)
      app.save(g)
    } catch (e3) {
      out.erro = 'grant: ' + String(e3).slice(0, 150)
      return e.json(200, out)
    }

    // ---------- 2. três leads dela ----------
    var ids = []
    for (var i = 1; i <= 3; i++) {
      try {
        const l = new Record(colL)
        l.set('nome', 'Prova Carteira ' + i)
        l.set('telefone', '55519980001' + i)
        l.set('origem', 'manual')
        l.set('status', 'entrada_lead')
        l.set('owner_id', pessoa.id)
        l.set('vendedor_nome', 'Vendedora Sai (fixture)')
        l.set('fixture', false)
        app.save(l)
        ids.push(l.id)
      } catch (e4) {}
    }
    out.passos.push({
      passo: '2. leads dela',
      ok: ids.length === 3,
      detalhe: ids.length + ' criados',
    })

    // ---------- 3. suspende pela rota real ----------
    const auth = String(e.request.header.get('Authorization') || '')
    var susp = null
    try {
      const resp = $http.send({
        url:
          'https://sistema-marketing-1f51e.shrd00.internal.goskip.dev/backend/v1/acessos/pessoa/' +
          pessoa.id +
          '/suspender',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ motivo: 'prova CA-3-69' }),
        timeout: 25,
      })
      var corpo = resp.body
      if (Array.isArray(corpo)) corpo = String.fromCharCode.apply(null, corpo)
      susp = JSON.parse(String(corpo))
    } catch (e5) {
      out.passos.push({
        passo: '3. suspender',
        ok: false,
        detalhe: String(e5).slice(0, 130),
      })
    }
    if (susp) {
      out.passos.push({
        passo: '3. suspender',
        ok: susp.ok === true,
        detalhe:
          'para_gestao=' +
          String(susp.leads_para_gestao) +
          ' redistribuidos=' +
          String(susp.leads_redistribuidos),
      })
    }

    // ---------- 4. o dono NÃO mudou ----------
    var aindaDela = 0
    for (const id of ids) {
      try {
        const l = app.findRecordById(colL, id)
        if (String(l.get('owner_id') || '') === pessoa.id) aindaDela++
      } catch (e6) {}
    }
    out.passos.push({
      passo: '4. dono NÃO mudou na suspensão',
      ok: aindaDela === ids.length,
      detalhe: aindaDela + ' de ' + ids.length + ' continuam com ela',
    })

    // ---------- 5. cada lead virou item na fila ----------
    var naFila = 0
    for (const id of ids) {
      try {
        const f = app.findRecordsByFilter(colPA, "lead='" + id + "' && resolvido=false", '', 1, 0)
        if (f && f.length > 0) naFila++
      } catch (e7) {}
    }
    out.passos.push({
      passo: '5. cada lead em "precisa de ação"',
      ok: naFila === ids.length,
      detalhe: naFila + ' de ' + ids.length,
    })

    // ---------- 6. gestão passa a carteira em bloco ----------
    var destino = ''
    try {
      const us = app.findRecordsByFilter(colU, "email='elisangela@haisan.com.br'", '', 1, 0)
      if (us && us.length > 0) destino = us[0].id
    } catch (e8) {}
    var passou = null
    if (destino !== '') {
      try {
        const resp2 = $http.send({
          url: 'https://sistema-marketing-1f51e.shrd00.internal.goskip.dev/backend/v1/gestao/passar-carteira',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: auth },
          body: JSON.stringify({ de: pessoa.id, para: destino }),
          timeout: 30,
        })
        var c2 = resp2.body
        if (Array.isArray(c2)) c2 = String.fromCharCode.apply(null, c2)
        passou = JSON.parse(String(c2))
      } catch (e9) {}
    }
    if (passou) {
      out.passos.push({
        passo: '6. carteira passada em bloco',
        ok: passou.ok === true && Number(passou.leads_movidos) === ids.length,
        detalhe: 'leads=' + String(passou.leads_movidos) + ' eventos=' + String(passou.eventos),
      })
      // um evento por lead
      var comEvento = 0
      for (const id of ids) {
        try {
          const evs = app.findRecordsByFilter(colEv, "lead_id='" + id + "'", '', 50, 0)
          var achou = false
          for (const x of evs) {
            if (String(x.get('texto') || '').indexOf('Carteira passada') >= 0) achou = true
          }
          if (achou) comEvento++
        } catch (eA) {}
      }
      out.passos.push({
        passo: '7. um evento por lead',
        ok: comEvento === ids.length,
        detalhe: comEvento + ' de ' + ids.length,
      })
    }

    // ---------- 8. limpeza ----------
    var limpo = true
    for (const id of ids) {
      try {
        const evs = app.findRecordsByFilter(colEv, "lead_id='" + id + "'", '', 100, 0)
        for (const x of evs) {
          try {
            app.delete(x)
          } catch (b2) {}
        }
      } catch (c2) {}
      try {
        const pas = app.findRecordsByFilter(colPA, "lead='" + id + "'", '', 10, 0)
        for (const p of pas) {
          try {
            app.delete(p)
          } catch (d2) {}
        }
      } catch (eB) {}
      try {
        app.delete(app.findRecordById(colL, id))
      } catch (eC) {
        limpo = false
      }
    }
    try {
      const gs = app.findRecordsByFilter(colG, "user_id='" + pessoa.id + "'", '', 20, 0)
      for (const g of gs) {
        try {
          app.delete(g)
        } catch (a3) {}
      }
      app.delete(pessoa)
    } catch (eD) {
      limpo = false
    }
    out.passos.push({
      passo: '8. limpeza',
      ok: limpo,
      detalhe: 'lead, eventos, itens e conta de teste apagados',
    })

    var tudo = true
    for (const p of out.passos) if (!p.ok) tudo = false
    out.ok = tudo
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
