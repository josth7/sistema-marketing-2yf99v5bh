routerAdd(
  'GET',
  '/backend/v1/diag/pedidos-recentes',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const col = $app.findCollectionByNameOrId('whatsapp_transferencias')
    const trs = $app.findRecordsByFilter(col, '', '', 2000, 0)
    const out = []
    for (const t of trs) {
      const c = String(t.get('created') || '')
      if (c < '2026-11-05') continue
      out.push({
        id: t.id,
        estado: String(t.get('estado') || ''),
        regra: String(t.get('regra') || ''),
        detalhe: String(t.get('detalhe') || '').slice(0, 40),
        envios: String(t.get('envios') || '').slice(0, 30),
        criado: c.slice(0, 16),
        lead: String(t.get('lead') || '').slice(0, 12),
      })
    }
    out.sort(function (a, b) {
      return a.criado < b.criado ? -1 : 1
    })
    return e.json(200, { ok: true, total: trs.length, recentes: out.length, itens: out })
  },
  $apis.requireAuth(),
)
