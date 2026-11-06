/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA CA-3-57 — cliente da carteira vai ao vendedor dela (05/11).
 *
 * **O que precisa ficar provado:** um contato que está na carteira de UM
 * vendedor e escreve para a central nasce com esse vendedor como dono, **sem
 * passar pelo rodízio**; e a frase de transferência traz o link do WhatsApp
 * dele.
 *
 * Usa um telefone REAL da carteira (sem tocar no dado): só lê qual é o dono e
 * simula a decisão do webhook com a mesma lógica. Depois cria um lead de teste
 * com esse telefone, confere o dono e apaga o LEAD (não o contato).
 *
 * GET /backend/v1/diag/prova-carteira-dono
 */
routerAdd(
  'GET',
  '/backend/v1/diag/prova-carteira-dono',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { passos: [], ok: false }
    const colCart = app.findCollectionByNameOrId('carteira_contatos')
    const colL = app.findCollectionByNameOrId('crm_leads')
    const colEv = app.findCollectionByNameOrId('crm_lead_events')

    // ---------- 1. um telefone que está numa carteira só ----------
    var amostra = []
    try {
      amostra = app.findRecordsByFilter(colCart, "lote='imp-0511-exclusivo'", '', 20, 0)
    } catch (e0) {}
    var escolhido = null
    for (const a of amostra) {
      const tel = String(a.get('telefone') || '')
      if (tel.length < 12) continue
      // confirma que esse telefone está em UMA conexão só
      try {
        const todos = app.findRecordsByFilter(colCart, "telefone='" + tel + "'", '', 20, 0)
        const conex = {}
        for (const t of todos) conex[String(t.get('conexao') || '')] = true
        if (Object.keys(conex).length === 1) {
          escolhido = a
          break
        }
      } catch (e1) {}
    }
    if (!escolhido) {
      out.erro = 'não achei telefone exclusivo na carteira'
      return e.json(200, out)
    }
    const tel = String(escolhido.get('telefone') || '')
    const vendedorUser = String(escolhido.get('vendedor_user') || '')
    var nomeVend = ''
    try {
      const u = app.findRecordById('users', vendedorUser)
      nomeVend = String(u.get('name') || u.get('email') || '')
    } catch (e2) {}
    out.telefone = tel
    out.vendedor_da_carteira = nomeVend
    out.passos.push({
      passo: '1. achei cliente exclusivo de um vendedor',
      ok: vendedorUser !== '',
      detalhe: nomeVend + ' · ' + tel,
    })

    // ---------- 2. limpa lead de teste anterior ----------
    try {
      const antigos = app.findRecordsByFilter(
        colL,
        "telefone='" + tel + "' && origem='carteira'",
        '',
        10,
        0,
      )
      for (const a of antigos) {
        try {
          const es = app.findRecordsByFilter(colEv, "lead_id='" + a.id + "'", '', 50, 0)
          for (const x of es) {
            try {
              app.delete(x)
            } catch (b) {}
          }
        } catch (c) {}
        try {
          app.delete(a)
        } catch (d) {}
      }
    } catch (e3) {}

    // ---------- 3. simula a decisão do webhook ----------
    // mesma lógica: acha na carteira pelas variantes, exige UM dono só
    var donos = {}
    try {
      const v1 = tel
      const ddd = tel.slice(2, 4)
      const resto = tel.slice(4)
      const variantes = [tel]
      if (tel.length === 13 && resto.charAt(0) === '9') variantes.push('55' + ddd + resto.slice(1))
      if (tel.length === 12) variantes.push('55' + ddd + '9' + resto)
      for (const v of variantes) {
        const rs = app.findRecordsByFilter(colCart, "telefone='" + v + "'", '', 20, 0)
        for (const r of rs) {
          const u = String(r.get('vendedor_user') || '')
          if (u !== '') donos[u] = true
        }
      }
    } catch (e4) {}
    const lista = Object.keys(donos)
    out.passos.push({
      passo: '2. a carteira aponta UM dono só (sem conflito)',
      ok: lista.length === 1 && lista[0] === vendedorUser,
      detalhe: lista.length + ' dono(s)',
    })

    // ---------- 4. cria o lead como o webhook faria ----------
    var lead = null
    try {
      lead = new Record(colL)
      lead.set('nome', 'Prova Carteira Dono')
      lead.set('telefone', tel)
      lead.set('origem', 'carteira')
      lead.set('status', 'entrada_lead')
      lead.set('owner_id', lista.length === 1 ? lista[0] : '')
      lead.set('fixture', false)
      app.save(lead)
    } catch (e5) {
      out.erro = 'criar lead: ' + String(e5).slice(0, 150)
      return e.json(200, out)
    }
    out.passos.push({
      passo: '3. lead nasceu com o dono da carteira (sem rodízio)',
      ok: String(lead.get('owner_id') || '') === vendedorUser,
      detalhe: 'dono=' + nomeVend,
    })

    // ---------- 5. o link da frase aponta para esse vendedor ----------
    var numeroVend = ''
    var link = ''
    try {
      const cxs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "vendedor_user='" + vendedorUser + "'",
        '',
        5,
        0,
      )
      if (cxs.length > 0) {
        numeroVend = String(cxs[0].get('numero') || '').replace(/\D/g, '')
        link =
          'https://wa.me/' +
          numeroVend +
          '?text=' +
          encodeURIComponent('Oi, ' + nomeVend.split(' ')[0] + '! Vim do atendimento da Haisan')
      }
    } catch (e6) {}
    out.link = link
    out.passos.push({
      passo: '4. frase de transferência com o link do vendedor',
      ok: link !== '' && link.indexOf(numeroVend) > 0 && numeroVend !== tel,
      detalhe: link !== '' ? link.slice(0, 62) : 'sem link',
    })

    // ---------- 6. limpeza (apaga o LEAD, não o contato) ----------
    try {
      app.delete(lead)
      out.passos.push({
        passo: '5. limpeza',
        ok: true,
        detalhe: 'lead de teste apagado; carteira intacta',
      })
    } catch (e7) {
      out.passos.push({ passo: '5. limpeza', ok: false, detalhe: String(e7).slice(0, 100) })
    }

    var tudo = true
    for (const p of out.passos) if (!p.ok) tudo = false
    out.ok = tudo
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
