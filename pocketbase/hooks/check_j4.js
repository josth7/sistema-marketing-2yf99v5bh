/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/j4',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, itens: [] }
    const cs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true && fixture=false",
      '',
      1,
      0,
    )
    if (!cs.length) return e.json(200, { ok: false })
    const id = cs[0].id
    const ms = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "conexao='" + id + "' && direcao='entrada' && created>='2026-11-12 18:30'",
      '',
      100,
      0,
    )
    for (const m of ms)
      out.itens.push({
        q: String(m.get('created') || '').slice(11, 19),
        tel: String(m.get('contato_telefone') || ''),
        txt: String(m.get('texto') || '').slice(0, 45),
      })
    out.itens.sort(function (a, b) {
      return a.q < b.q ? 1 : -1
    })
    out.itens = out.itens.slice(0, 8)
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
