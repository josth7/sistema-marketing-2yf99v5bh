/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (09/11) — onde a mensagem do cliente cai.
 *
 * Para cada vendedor, conta as conversas dos leads DELE divididas por:
 *   - no número dele (ele recebe no celular);
 *   - na CENTRAL (recebe no celular da central);
 *   - no número de outro vendedor.
 *
 * GET /backend/v1/diag/onde-cai
 */
routerAdd(
  'GET',
  '/backend/v1/diag/onde-cai',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, vendedores: [], total_central: 0 }

    const nomes = {}
    try {
      for (const u of app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        '',
        '',
        300,
        0,
      )) {
        nomes[u.id] = String(u.get('name') || u.get('email') || '')
      }
    } catch (e0) {}

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
      }
    } catch (e1) {}

    // conversas por lead
    const convDoLead = {}
    try {
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
    } catch (e2) {}

    const porDono = {}
    try {
      for (const l of app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        12000,
        0,
      )) {
        const dono = String(l.get('owner_id') || '')
        if (dono === '') continue
        const n = nomes[dono] || dono
        if (n.indexOf('Marketing') >= 0) continue
        if (!porDono[n]) {
          porDono[n] = { no_proprio: 0, na_central: 0, em_outro: 0, sem_conversa: 0 }
        }
        const cvs = convDoLead[l.id] || []
        if (cvs.length === 0) {
          porDono[n].sem_conversa++
          continue
        }
        var naCentral = false
        var noProprio = false
        var emOutro = false
        for (const cx of cvs) {
          if (cxPapel[cx] === 'central') naCentral = true
          else if (cxVend[cx] === dono) noProprio = true
          else emOutro = true
        }
        if (naCentral) {
          porDono[n].na_central++
          out.total_central++
        }
        if (noProprio) porDono[n].no_proprio++
        if (emOutro) porDono[n].em_outro++
      }
    } catch (e3) {}

    for (const n in porDono) {
      const d = porDono[n]
      out.vendedores.push({
        nome: n,
        no_proprio: d.no_proprio,
        na_central: d.na_central,
        em_outro: d.em_outro,
        sem_conversa: d.sem_conversa,
      })
    }
    out.vendedores.sort(function (a, b) {
      return b.na_central - a.na_central
    })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
