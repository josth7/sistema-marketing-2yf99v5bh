/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/verif-triagem',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, leads: [] }
    for (const lid of ['khwf0omyf2', 'mqlnpip4ac', 'rl5yx14nos']) {
      const l = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        "id~'" + lid + "'",
        '',
        1,
        0,
      )
      if (!l.length) continue
      const lead = l[0]
      const cvs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "lead='" + lead.id + "'",
        '',
        5,
        0,
      )
      const conv = []
      for (const c of cvs)
        conv.push({
          estado: String(c.get('estado') || ''),
          etapa: String(c.get('etapa_atual') || ''),
          ultima: String(c.get('ultima_mensagem_em') || '').slice(0, 16),
        })
      out.leads.push({
        nome: String(lead.get('nome') || '').slice(0, 20),
        criado: String(lead.get('created') || '').slice(0, 16),
        dono: String(lead.get('owner_id') || '(vazio)').slice(0, 10),
        conversas: conv,
      })
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
