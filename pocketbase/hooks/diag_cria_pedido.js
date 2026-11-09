routerAdd(
  'POST',
  '/backend/v1/diag/cria-pedido',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const b = e.requestInfo().body || {}
    const tr = new Record($app.findCollectionByNameOrId('whatsapp_transferencias'))
    tr.set('lead', String(b.lead || ''))
    tr.set('origem_pedido', 'botao')
    tr.set('motivo', 'primeiro_contato')
    tr.set('simulacao', false)
    tr.set('fixture', false)
    $app.save(tr)
    const l = $app.findRecordById('crm_leads', String(b.lead || ''))
    return e.json(200, { ok: true, owner: String(l.get('owner_id') || '') })
  },
  $apis.requireAuth(),
)
