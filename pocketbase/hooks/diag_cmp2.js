routerAdd(
  'GET',
  '/backend/v1/diag/cmp2',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const out = { casos: [] }
    const colT = $app.findCollectionByNameOrId('whatsapp_transferencias')
    const trs = $app.findRecordsByFilter(colT, '', '', 2000, 0)
    for (const t of trs) {
      if (String(t.get('created') || '') < '2026-11-06') continue
      const lid = String(t.get('lead') || '')
      var l = null
      try {
        l = $app.findRecordById('crm_leads', lid)
      } catch (e) {
        continue
      }
      out.casos.push({
        estado: String(t.get('estado') || ''),
        tem_dono: String(l.get('owner_id') || '') !== '',
        status: String(l.get('status') || ''),
        criado: String(t.get('created') || '').slice(0, 16),
      })
      if (out.casos.length >= 40) break
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
