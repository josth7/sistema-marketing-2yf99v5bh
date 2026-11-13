/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/s1544',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, agora_utc: new Date().toISOString().slice(0, 19) }
    // 1. mensagens do 9036170 depois das 18:40 UTC (15:40 BRT)
    const ms = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "contato_telefone~'9036170' && created>='2026-11-13 18:40'",
      '',
      50,
      0,
    )
    out.do_numero = ms.length
    out.detalhes = []
    for (const m of ms)
      out.detalhes.push({
        q: String(m.get('created') || '').slice(11, 19),
        dir: String(m.get('direcao') || ''),
        txt: String(m.get('texto') || '').slice(0, 30),
      })
    // 2. a central recebeu algo depois das 18:40?
    const cs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true && fixture=false",
      '',
      1,
      0,
    )
    if (cs.length > 0) {
      const id = cs[0].id
      const ce = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "conexao='" + id + "' && direcao='entrada' && created>='2026-11-13 18:40'",
        '',
        200,
        0,
      )
      out.central_apos_1540 = ce.length
      const lst = []
      for (const m of ce)
        lst.push(
          String(m.get('created') || '').slice(11, 19) +
            ' ' +
            String(m.get('contato_telefone') || '').slice(-6),
        )
      lst.sort()
      out.ultimas_central = lst.slice(-5)
    }
    // 3. a conversa dele
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
    out.conversas = []
    for (const c of cvs)
      out.conversas.push({
        cx: nomes[String(c.get('conexao') || '')] || '?',
        estado: String(c.get('estado') || ''),
        msgs: Number(c.get('total_mensagens') || 0),
        ult: String(c.get('ultima_mensagem_em') || '').slice(0, 16),
      })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
