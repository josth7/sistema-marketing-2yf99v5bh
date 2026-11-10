routerAdd(
  'GET',
  '/backend/v1/diag/porque-sem-aviso',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = {
      ok: true,
      msgs_central: 0,
      com_lead: 0,
      sem_lead: 0,
      ia_atendendo: 0,
      ja_avisado: 0,
      elegiveis: 0,
      exemplos: [],
    }
    const cxP = {},
      cxV = {}
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      'ativo=true',
      '',
      60,
      0,
    )) {
      cxP[c.id] = String(c.get('papel') || '')
      cxV[c.id] = String(c.get('vendedor_user') || '')
    }
    const agora = new Date().getTime()
    const msgs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "direcao='entrada'",
      '',
      2000,
      0,
    )
    for (const m of msgs) {
      const cx = String(m.get('conexao') || '')
      if (cxP[cx] !== 'central') continue
      const q = new Date(String(m.get('enviada_em') || m.get('created') || '')).getTime()
      if (!(q > 0) || agora - q > 2 * 3600000) continue
      out.msgs_central++
      const tel = String(m.get('contato_telefone') || '').replace(/[^0-9]/g, '')
      var lead = null
      try {
        const ls = app.findRecordsByFilter(
          app.findCollectionByNameOrId('crm_leads'),
          "telefone='" + tel + "' && fixture=false",
          '',
          1,
          0,
        )
        if (ls.length > 0) lead = ls[0]
      } catch (e) {}
      if (!lead) {
        out.sem_lead++
        if (out.exemplos.length < 4) out.exemplos.push({ tel: tel.slice(-6), motivo: 'sem lead' })
        continue
      }
      out.com_lead++
      const dono = String(lead.get('owner_id') || '')
      if (dono === '') {
        if (out.exemplos.length < 6)
          out.exemplos.push({ tel: tel.slice(-6), motivo: 'lead sem dono' })
        continue
      }
      // ia atendendo?
      try {
        const cvs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_conversas'),
          "conexao='" + cx + "' && contato_telefone='" + tel + "'",
          '',
          1,
          0,
        )
        if (cvs.length > 0 && String(cvs[0].get('estado')) === 'triagem') {
          out.ia_atendendo++
          if (out.exemplos.length < 8)
            out.exemplos.push({ tel: tel.slice(-6), motivo: 'IA atendendo (triagem)' })
          continue
        }
      } catch (e) {}
      out.elegiveis++
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
