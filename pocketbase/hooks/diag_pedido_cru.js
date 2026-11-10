routerAdd(
  'GET',
  '/backend/v1/diag/pedido-cru',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const colT = $app.findCollectionByNameOrId('whatsapp_transferencias')
    const ts = $app.findRecordsByFilter(colT, '', '', 5, 0)
    const out = []
    for (const t of ts) {
      out.push({
        lead: String(t.get('lead') || '').slice(0, 10),
        estado: String(t.get('estado') || ''),
        simulacao: String(t.get('simulacao')),
        regra: String(t.get('regra') || ''),
        detalhe: String(t.get('detalhe') || '').slice(0, 40),
        vend: String(t.get('vendedor_user') || '').slice(0, 10),
      })
    }
    return e.json(200, { itens: out })
  },
  $apis.requireAuth(),
)
