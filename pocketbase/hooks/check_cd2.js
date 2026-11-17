/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/crm-dono',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, porVendedor: {} }
    // conta leads por vendedor (os 33 corrigidos entraram na carteira deles)
    const vend = {}
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='vendedor' && ativo=true && fixture=false",
      '',
      30,
      0,
    )) {
      const uid = String(c.get('vendedor_user') || '')
      if (uid !== '') vend[uid] = String(c.get('nome_exibicao') || '')
    }
    const leads = app.findRecordsByFilter(
      app.findCollectionByNameOrId('crm_leads'),
      'fixture=false',
      '',
      6000,
      0,
    )
    for (const l of leads) {
      const ow = String(l.get('owner_id') || '')
      if (vend[ow] === undefined) continue
      out.porVendedor[vend[ow]] = (out.porVendedor[vend[ow]] || 0) + 1
    }
    // amostra: 3 leads corrigidos, confirmando o dono e o evento
    const amostra = []
    for (const t of ['177030', '554950', '729772']) {
      const l = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        "telefone~'" + t + "'",
        '',
        1,
        0,
      )
      if (!l.length) continue
      const ow = String(l[0].get('owner_id') || '')
      var evs = 0
      try {
        evs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('crm_lead_events'),
          "lead_id='" + l[0].id + "' && texto~'Dono corrigido'",
          '',
          5,
          0,
        ).length
      } catch (e1) {}
      amostra.push({ tel: t, dono: vend[ow] || '(sem dono)', evento_de_correcao: evs > 0 })
    }
    out.amostra = amostra
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
