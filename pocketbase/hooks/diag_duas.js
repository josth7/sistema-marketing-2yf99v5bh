/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (09/11) — duas perguntas do dono.
 *
 * **1. "não chega no celular":** as mensagens chegam no número do vendedor
 * (conexão dele), mas **o cliente escreve para a CENTRAL**. Nesse caso a
 * mensagem cai no celular da central, não no do vendedor — ele só vê no CRM.
 * Aqui se conta, por vendedor: quantos leads dele têm conversa na CENTRAL e
 * quantos no número DELE.
 *
 * **2. discrepância na distribuição:** o rodízio deveria dar mais a quem tem
 * MENOS. Aqui se mostra a carga real de cada um e quantas vezes foi escolhido.
 *
 * GET /backend/v1/diag/duas-perguntas
 */
routerAdd(
  'GET',
  '/backend/v1/diag/duas-perguntas',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, vendedores: [], central: 0, rodizio: [] }

    const nomes = {}
    const emails = {}
    try {
      for (const u of app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        '',
        '',
        300,
        0,
      )) {
        nomes[u.id] = String(u.get('name') || u.get('email') || '')
        emails[u.id] = String(u.get('email') || '').toLowerCase()
      }
    } catch (e0) {}

    // ---------- conexões: quem é central ----------
    const cxPapel = {}
    const cxVend = {}
    try {
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        'ativo=true',
        '',
        60,
        0,
      )) {
        cxPapel[c.id] = String(c.get('papel') || '')
        cxVend[c.id] = String(c.get('vendedor_user') || '')
        if (String(c.get('papel')) === 'central') out.central++
      }
    } catch (e1) {}

    // ---------- conversas: por conexão ----------
    const convPorCx = {}
    try {
      for (const cv of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        'fixture=false',
        '',
        8000,
        0,
      )) {
        const cx = String(cv.get('conexao') || '')
        convPorCx[cx] = (convPorCx[cx] || 0) + 1
      }
    } catch (e2) {}

    // ---------- leads por dono + onde está a conversa ----------
    const porDono = {}
    try {
      const leads = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        12000,
        0,
      )
      const convDoLead = {}
      for (const cv of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        'fixture=false',
        '',
        8000,
        0,
      )) {
        const lid = String(cv.get('lead') || '')
        if (lid === '') continue
        if (!convDoLead[lid]) convDoLead[lid] = []
        convDoLead[lid].push(String(cv.get('conexao') || ''))
      }
      for (const l of leads) {
        const dono = String(l.get('owner_id') || '')
        if (dono === '') continue
        if (!porDono[dono]) {
          porDono[dono] = {
            nome: nomes[dono] || dono,
            email: emails[dono] || '',
            leads: 0,
            conversa_na_central: 0,
            conversa_no_proprio: 0,
            sem_conversa: 0,
          }
        }
        porDono[dono].leads++
        const cvs = convDoLead[l.id] || []
        if (cvs.length === 0) {
          porDono[dono].sem_conversa++
          continue
        }
        var naCentral = false
        var noProprio = false
        for (const cx of cvs) {
          if (cxPapel[cx] === 'central') naCentral = true
          if (cxVend[cx] === dono) noProprio = true
        }
        if (naCentral) porDono[dono].conversa_na_central++
        if (noProprio) porDono[dono].conversa_no_proprio++
      }
    } catch (e3) {}

    // ---------- rodízio: quem foi escolhido e quando ----------
    const escolhas = {}
    try {
      for (const t of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_transferencias'),
        "estado='concluida'",
        '',
        6000,
        0,
      )) {
        const v = String(t.get('vendedor_user') || '')
        if (v === '') continue
        if (!escolhas[v]) escolhas[v] = { nome: nomes[v] || v, vezes: 0, ultima: '' }
        escolhas[v].vezes++
        const q = String(t.get('created') || '')
        if (q > escolhas[v].ultima) escolhas[v].ultima = q
      }
    } catch (e4) {}

    // junta
    for (const id in porDono) {
      const d = porDono[id]
      // só vendedor (não gestão/marketing)
      if (d.email.indexOf('@haisan') < 0) continue
      d.rodizio_vezes = escolhas[id] ? escolhas[id].vezes : 0
      d.rodizio_ultima = escolhas[id] ? String(escolhas[id].ultima).slice(0, 16) : ''
      out.vendedores.push(d)
    }
    out.vendedores.sort(function (a, b) {
      return b.leads - a.leads
    })

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
