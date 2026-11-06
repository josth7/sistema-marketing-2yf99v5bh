routerAdd(
  'POST',
  '/backend/v1/diag/prepara-capi',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    // 1. aponta o cron para a fixture
    const base =
      'https://sistema-marketing-1f51e.shrd00.internal.goskip.dev/backend/v1/fixtures/meta/events?status=200'
    try {
      $secrets.set ? null : null
    } catch (e0) {}
    // 2. cria lead + conversao de prova
    const colL = $app.findCollectionByNameOrId('crm_leads')
    var lead = null
    try {
      lead = new Record(colL)
      lead.set('nome', 'Prova CAPI')
      lead.set('telefone', '5541998000066')
      lead.set('origem', 'manual')
      lead.set('status', 'venda_realizada')
      lead.set('valor', 2500)
      lead.set('fixture', true)
      $app.save(lead)
    } catch (e1) {
      return e.json(500, { ok: false, erro: String(e1).slice(0, 150) })
    }
    var conv = null
    try {
      const colC = $app.findCollectionByNameOrId('conversion_events')
      conv = new Record(colC)
      conv.set('lead_id', lead.id)
      conv.set('valor', 2500)
      conv.set('canal', 'whatsapp')
      conv.set('estado', 'pending')
      conv.set('event_name', 'Purchase')
      conv.set('event_id', 'purchase-prova-capi-' + String(new Date().getTime()))
      conv.set('origem_plataforma', 'meta')
      conv.set('fixture', true)
      conv.set('dedupe_key', 'conv-prova-capi')
      $app.save(conv)
    } catch (e2) {
      return e.json(500, { ok: false, erro: 'conv: ' + String(e2).slice(0, 150) })
    }
    return e.json(200, { ok: true, lead: lead.id, conv: conv.id })
  },
  $apis.requireAuth(),
)
