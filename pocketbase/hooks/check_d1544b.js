/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/d1544b',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, todas: [], lead: null, transf: [] }
    const cvs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conversas'),
      "contato_telefone~'9036170'",
      '',
      10,
      0,
    )
    const nomes = {}
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      '',
      '',
      60,
      0,
    ))
      nomes[c.id] = String(c.get('nome_exibicao') || '')
    var alvo = null
    for (const c of cvs)
      if (String(nomes[String(c.get('conexao') || '')] || '').indexOf('Atendimento') >= 0) alvo = c
    if (!alvo) return e.json(200, { ok: false })
    // TODAS as mensagens dessa conversa (para ver o historico)
    const ms = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "conexao='" + String(alvo.get('conexao')) + "' && contato_telefone~'9036170'",
      '',
      200,
      0,
    )
    for (const m of ms)
      out.todas.push({
        q: String(m.get('created') || '').slice(5, 19),
        dir: String(m.get('direcao') || ''),
        autor: String(m.get('autor') || ''),
        txt: String(m.get('texto') || '').slice(0, 45),
      })
    out.todas.sort(function (a, b) {
      return a.q < b.q ? -1 : 1
    })
    out.total = ms.length
    // o lead e a transferencia
    const lid = String(alvo.get('lead') || '')
    if (lid !== '') {
      try {
        const l = app.findRecordById('crm_leads', lid)
        var dono = ''
        try {
          dono = String(app.findRecordById('users', String(l.get('owner_id'))).get('name') || '')
        } catch (e) {}
        out.lead = {
          nome: String(l.get('nome') || ''),
          status: String(l.get('status') || ''),
          dono: dono,
        }
        const tr = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_transferencias'),
          "lead='" + lid + "'",
          '',
          5,
          0,
        )
        for (const t of tr)
          out.transf.push({
            estado: String(t.get('estado') || ''),
            vendedor: String(t.get('vendedor_nome') || ''),
            q: String(t.get('created') || '').slice(5, 19),
          })
      } catch (e2) {}
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
