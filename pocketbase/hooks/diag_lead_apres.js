routerAdd(
  'GET',
  '/backend/v1/diag/leads-da-apres',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const col = $app.findCollectionByNameOrId('whatsapp_envios')
    const es = $app.findRecordsByFilter(col, "motivo='apresentacao_vendedor'", '', 5, 0)
    const out = []
    for (const en of es) {
      const lid = String(en.get('lead') || '')
      var l = null
      try {
        l = $app.findRecordById('crm_leads', lid)
      } catch (x) {}
      out.push({
        lead: lid.slice(0, 10),
        lead_existe: l !== null,
        nome_lead: l ? String(l.get('nome') || '(vazio)') : '(sem lead)',
        owner: l ? String(l.get('owner_id') || '').slice(0, 10) : '',
        legenda: String(en.get('legenda') || '(vazia)').slice(0, 20),
        estado: String(en.get('estado') || ''),
      })
    }
    return e.json(200, { itens: out })
  },
  $apis.requireAuth(),
)
