routerAdd(
  'GET',
  '/backend/v1/diag/olha-6',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const colL = $app.findCollectionByNameOrId('crm_leads')
    const todos = $app.findRecordsByFilter(colL, 'fixture=false', '', 12000, 0)
    const out = []
    const colT = $app.findCollectionByNameOrId('whatsapp_transferencias')
    for (const l of todos) {
      if (String(l.get('owner_id') || '') !== '') continue
      if (String(l.get('status') || '') === 'descartado') continue
      const trs = $app.findRecordsByFilter(colT, "lead='" + l.id + "'", '', 5, 0)
      var info = []
      for (const t of trs)
        info.push({
          estado: String(t.get('estado') || ''),
          detalhe: String(t.get('detalhe') || '').slice(0, 40),
          vend: String(t.get('vendedor_user') || '').slice(0, 10),
        })
      out.push({ nome: String(l.get('nome') || '').slice(0, 16), pedidos: info })
    }
    return e.json(200, { n: out.length, itens: out })
  },
  $apis.requireAuth(),
)
