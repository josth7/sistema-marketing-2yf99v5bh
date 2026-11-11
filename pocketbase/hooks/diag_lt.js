routerAdd(
  'GET',
  '/backend/v1/diag/lead-teste',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const out = { ok: true }
    try {
      const es = $app.findRecordsByFilter('empresas', "apelido='TESTE'", '', 1, 0)
      if (!es.length) return e.json(200, { ok: false, erro: 'sem empresa teste' })
      const idT = es[0].id
      const colL = $app.findCollectionByNameOrId('crm_leads')
      const l = new Record(colL)
      l.set('nome', 'LEAD DA EMPRESA TESTE')
      l.set('telefone', '41999990001')
      l.set('status', 'entrada_lead')
      l.set('origem', 'teste')
      l.set('empresa', idT)
      l.set('fixture', true)
      $app.save(l)
      out.lead = l.id
    } catch (e1) {
      out.erro = String(e1).slice(0, 200)
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
