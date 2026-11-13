/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/leg',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, itens: [] }
    const ap = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "motivo='apresentacao_vendedor' && created>='2026-11-12 18:00'",
      '',
      50,
      0,
    )
    for (const x of ap)
      out.itens.push({
        q: String(x.get('created') || '').slice(5, 16),
        dest: String(x.get('destino_telefone') || '').slice(-6),
        est: String(x.get('estado') || ''),
        legenda: String(x.get('legenda') || '(VAZIO)').slice(0, 40),
        variaveis: JSON.stringify(x.get('variaveis') || {}).slice(0, 70),
      })
    out.itens.sort(function (a, b) {
      return a.q < b.q ? -1 : 1
    })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
