routerAdd(
  'GET',
  '/backend/v1/diag/cmp3',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const colT = $app.findCollectionByNameOrId('whatsapp_transferencias')
    const trs = $app.findRecordsByFilter(colT, '', '', 2000, 0)
    const comDono = {},
      semDono = {}
    for (const t of trs) {
      if (String(t.get('created') || '') < '2026-11-06') continue
      if (String(t.get('estado')) !== 'concluida') continue
      var l = null
      try {
        l = $app.findRecordById('crm_leads', String(t.get('lead') || ''))
      } catch (e) {
        continue
      }
      const tem = String(l.get('owner_id') || '') !== ''
      const k = tem ? 'com' : 'sem'
      const cx = String(l.get('entrada_whatsapp') || '(vazio)')
      const org = String(l.get('origem') || '(vazio)')
      const alvo = tem ? comDono : semDono
      alvo[cx + '|' + org] = (alvo[cx + '|' + org] || 0) + 1
    }
    return e.json(200, { com: comDono, sem: semDono })
  },
  $apis.requireAuth(),
)
