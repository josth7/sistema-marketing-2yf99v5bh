/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/janela1517',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true }
    // eventos entre 18:10 e 18:30 UTC (15:10-15:30 BRT)
    const ev = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_eventos'),
      "created>='2026-11-12 18:10' && created<='2026-11-12 18:30'",
      '',
      200,
      0,
    )
    out.eventos_janela = ev.length
    const lista = []
    for (const x of ev)
      lista.push(String(x.get('created') || '').slice(11, 19) + ' ' + String(x.get('evento') || ''))
    lista.sort()
    out.eventos = lista.slice(0, 12)
    // mensagens de ENTRADA na janela (qualquer numero)
    const m = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "direcao='entrada' && created>='2026-11-12 18:10' && created<='2026-11-12 18:35'",
      '',
      50,
      0,
    )
    out.entradas_janela = m.length
    const lm = []
    for (const x of m)
      lm.push(
        String(x.get('created') || '').slice(11, 19) +
          ' ' +
          String(x.get('contato_telefone') || '').slice(-6),
      )
    lm.sort()
    out.entradas = lm.slice(0, 10)
    // a ULTIMA entrada de verdade (maior created) - varre 400 e pega o max
    const todas = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "direcao='entrada'",
      '',
      400,
      0,
    )
    var ult = ''
    for (const x of todas) {
      const q = String(x.get('created') || '')
      if (q > ult) ult = q
    }
    out.ultima_entrada_max = ult.slice(0, 19)
    out.total_varrido = todas.length
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
