routerAdd(
  'GET',
  '/backend/v1/diag/olha-marcados',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const col = $app.findCollectionByNameOrId('whatsapp_envios')
    const es = $app.findRecordsByFilter(col, "motivo='apresentacao_vendedor'", '', 3000, 0)
    const ids = []
    for (const en of es) {
      const est = String(en.get('estado') || '')
      if (est !== 'erro' && est !== 'erro_definitivo') continue
      const lid = String(en.get('lead') || '')
      if (lid !== '') ids.push(lid)
    }
    const out = []
    const nomes = {}
    for (const u of $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('users'),
      '',
      '',
      300,
      0,
    ))
      nomes[u.id] = String(u.get('name') || '')
    for (const lid of ids.slice(0, 6)) {
      var l = null
      try {
        l = $app.findRecordById('crm_leads', lid)
      } catch (x) {}
      if (l)
        out.push({
          dono: String(l.get('owner_id') || '(vazio)').slice(0, 12),
          dono_nome: nomes[String(l.get('owner_id') || '')] || '(nenhum)',
          status: String(l.get('status') || ''),
          recontato_em: String(l.get('recontato_em') || '(vazio)'),
        })
    }
    return e.json(200, { com_falha: ids.length, amostra: out })
  },
  $apis.requireAuth(),
)
