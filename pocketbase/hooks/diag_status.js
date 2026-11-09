routerAdd(
  'GET',
  '/backend/v1/diag/testa-status',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    // pega um lead sem dono com pedido concluido
    const colL = $app.findCollectionByNameOrId('crm_leads')
    const colT = $app.findCollectionByNameOrId('whatsapp_transferencias')
    const trs = $app.findRecordsByFilter(colT, '', '', 2000, 0)
    var alvo = null
    for (const t of trs) {
      if (String(t.get('estado')) !== 'concluida') continue
      if (String(t.get('created') || '') < '2026-11-06') continue
      var l = null
      try {
        l = $app.findRecordById('crm_leads', String(t.get('lead') || ''))
      } catch (e) {
        continue
      }
      if (String(l.get('owner_id') || '') !== '') continue
      alvo = { lead: l, tr: t }
      break
    }
    if (!alvo) return e.json(200, { ok: false, erro: 'nenhum caso' })
    const l = alvo.lead
    const out = {
      ok: true,
      lead_id: l.id,
      status: String(l.get('status') || ''),
      status_bruto_tipo: typeof l.get('status'),
      status_bruto: l.get('status'),
    }
    // TESTE: reproduz a condicao exata do codigo
    const st1 = String(l.get('status') || 'novo')
    out.comparacao_com_novo = st1 === 'novo'
    // tenta setar owner e salvar COM o status atual (o bloco 3 faz isso)
    try {
      l.set('owner_id', 'parpvpjn8j8qkmy')
      $app.save(l)
      out.save_ok = true
    } catch (eS) {
      out.save_erro = String(eS).slice(0, 250)
    }
    // rele
    try {
      const r2 = $app.findRecordById('crm_leads', l.id)
      out.owner_depois = String(r2.get('owner_id') || '')
      // reverte
      r2.set('owner_id', '')
      $app.save(r2)
      out.revertido = true
    } catch (eR) {
      out.rev_erro = String(eR).slice(0, 150)
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
