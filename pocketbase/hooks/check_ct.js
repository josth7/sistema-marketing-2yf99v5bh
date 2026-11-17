/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/conf-transf',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, casos: [] }
    const tels = ['660503', '058595', '177030', '010808', '554950']
    for (const t of tels) {
      var leadId = ''
      try {
        const l = app.findRecordsByFilter(
          app.findCollectionByNameOrId('crm_leads'),
          "telefone~'" + t + "'",
          '',
          1,
          0,
        )
        if (l.length > 0) leadId = l[0].id
      } catch (e1) {}
      if (leadId === '') continue
      // o registro da transferencia diz qual vendedor foi escolhido
      const trs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_transferencias'),
        "lead='" + leadId + "'",
        '',
        5,
        0,
      )
      const lst = []
      for (const tr of trs)
        lst.push({
          vendedor: String(tr.get('vendedor_nome') || ''),
          estado: String(tr.get('estado') || ''),
          q: String(tr.get('created') || '').slice(0, 16),
        })
      out.casos.push({ tel: t, lead: leadId.slice(0, 10), transferencias: lst })
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
