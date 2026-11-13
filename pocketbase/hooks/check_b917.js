/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/busca917',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, janela: [], por_tel: [] }
    // TODAS as mensagens recebidas entre 16:30 e 17:10 UTC (13:30-14:10 BRT)
    const ms = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "direcao='entrada' && created>='2026-11-13 16:30' && created<='2026-11-13 17:10'",
      '',
      200,
      0,
    )
    const lst = []
    for (const m of ms)
      lst.push(
        String(m.get('created') || '').slice(11, 19) +
          ' | ' +
          String(m.get('contato_telefone') || '') +
          ' | ' +
          String(m.get('texto') || '').slice(0, 25),
      )
    lst.sort()
    out.janela = lst
    out.total_janela = ms.length
    // algum telefone terminando em 2937?
    var achou = false
    for (const m of ms) {
      if (String(m.get('contato_telefone') || '').indexOf('2937') >= 0) achou = true
    }
    out.tem_2937 = achou
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
