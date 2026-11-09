routerAdd(
  'GET',
  '/backend/v1/diag/confere-vendedores',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const col = $app.findCollectionByNameOrId('whatsapp_transferencias')
    const trs = $app.findRecordsByFilter(col, '', '', 2000, 0)
    const out = { concluida_sem_dono: 0, por_vendedor: {}, exemplos: [] }
    const colL = $app.findCollectionByNameOrId('crm_leads')
    for (const t of trs) {
      const c = String(t.get('created') || '')
      if (c < '2026-11-06') continue
      if (String(t.get('estado')) !== 'concluida') continue
      const lid = String(t.get('lead') || '')
      var l = null
      try {
        l = $app.findRecordById('crm_leads', lid)
      } catch (e) {
        continue
      }
      if (String(l.get('owner_id') || '') !== '') continue
      out.concluida_sem_dono++
      const v = String(t.get('vendedor_user') || '')
      out.por_vendedor[v] = (out.por_vendedor[v] || 0) + 1
      if (out.exemplos.length < 5) {
        out.exemplos.push({
          pedido: t.id,
          lead: lid,
          nome: String(l.get('nome') || ''),
          status: String(l.get('status') || ''),
          vendedor: v,
          detalhe: String(t.get('detalhe') || ''),
          envios: String(t.get('envios') || '').slice(0, 30),
        })
      }
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
