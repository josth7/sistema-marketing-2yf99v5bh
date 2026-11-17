/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/lead-det',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, casos: [] }
    for (const t of ['660503', '058595', '177030', '010808', '554950']) {
      const l = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        "telefone~'" + t + "'",
        '',
        1,
        0,
      )
      if (!l.length) continue
      const lead = l[0]
      // qual conexao entregou a primeira mensagem (a que criou o lead)?
      const ms = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "contato_telefone~'" + t + "'",
        '',
        100,
        0,
      )
      const lst = []
      for (const m of ms)
        lst.push({
          q: String(m.get('created') || '').slice(0, 16),
          dir: String(m.get('direcao') || ''),
          cx: String(m.get('conexao') || '').slice(0, 8),
        })
      lst.sort(function (a, b) {
        return a.q < b.q ? -1 : 1
      })
      out.casos.push({
        tel: t,
        criado: String(lead.get('created') || '').slice(0, 16),
        donoAtual: String(lead.get('owner_id') || '').slice(0, 8),
        origem: String(lead.get('origem') || ''),
        primeiras: lst.slice(0, 2),
      })
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
