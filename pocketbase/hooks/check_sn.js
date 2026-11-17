/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/sem-numero',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, itens: [], porNome: {} }
    const trs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_transferencias'),
      "estado='sem_numero'",
      '-created',
      100,
      0,
    )
    for (const t of trs) {
      const vn = String(t.get('vendedor_nome') || '(vazio)')
      out.porNome[vn] = (out.porNome[vn] || 0) + 1
      out.itens.push({
        q: String(t.get('created') || '').slice(0, 16),
        vn: vn,
        motivo: String(t.get('motivo') || ''),
        det: String(t.get('detalhe') || '').slice(0, 40),
        vid: String(t.get('vendedor_id') || '').slice(0, 10),
      })
    }
    out.itens.sort(function (a, b) {
      return a.q < b.q ? -1 : 1
    })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
