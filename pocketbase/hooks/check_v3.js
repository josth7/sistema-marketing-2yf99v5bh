/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/v3',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, agora_utc: new Date().toISOString().slice(0, 19) }
    // a central recebeu ALGUMA coisa nas ultimas 2h?
    const cs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true && fixture=false",
      '',
      1,
      0,
    )
    if (cs.length > 0) {
      const id = cs[0].id
      const ms = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "conexao='" + id + "' && direcao='entrada' && created>='2026-11-13 14:00'",
        '',
        100,
        0,
      )
      out.central_entradas_2h = ms.length
      const lst = []
      for (const m of ms)
        lst.push(
          String(m.get('created') || '').slice(11, 19) +
            ' ' +
            String(m.get('contato_telefone') || '').slice(-6) +
            ' ' +
            String(m.get('texto') || '').slice(0, 20),
        )
      lst.sort()
      out.ultimas_central = lst.slice(-6)
    }
    // TODOS os eventos de hoje (o webhook vive?)
    const ev = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_eventos'),
      "created>='2026-11-13 14:00'",
      '',
      300,
      0,
    )
    const porEv = {}
    for (const x of ev) {
      const k = String(x.get('evento') || '')
      porEv[k] = (porEv[k] || 0) + 1
    }
    out.eventos_desde_14utc = porEv
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
