routerAdd(
  'GET',
  '/backend/v1/diag/compara-pedidos',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const col = $app.findCollectionByNameOrId('whatsapp_transferencias')
    const trs = $app.findRecordsByFilter(col, '', '', 20, 0)
    const out = []
    for (const t of trs) {
      out.push({
        id: t.id,
        estado: String(t.get('estado') || ''),
        regra: String(t.get('regra') || ''),
        detalhe: String(t.get('detalhe') || '').slice(0, 40),
        envios: String(t.get('envios') || '').slice(0, 40),
        criado: String(t.get('created') || '').slice(0, 16),
        lead: String(t.get('lead') || '').slice(0, 10),
      })
    }
    return e.json(200, { ok: true, n: trs.length, itens: out })
  },
  $apis.requireAuth(),
)
