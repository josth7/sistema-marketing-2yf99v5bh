routerAdd(
  'GET',
  '/backend/v1/diag/leads-prova',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const colL = $app.findCollectionByNameOrId('crm_leads')
    const colU = $app.findCollectionByNameOrId('users')
    var leads = []
    try {
      leads = $app.findRecordsByFilter(colL, "nome~'Prova Suspensao' || nome~'Diag '", '', 60, 0)
    } catch (err) {
      return e.json(200, { ok: false, erro: String(err).slice(0, 200) })
    }
    var nomes = {}
    try {
      for (const u of $app.findRecordsByFilter(colU, '', '', 300, 0)) {
        nomes[u.id] = String(u.get('name') || u.get('email') || '')
      }
    } catch (e0) {}
    const itens = []
    for (const l of leads) {
      const ow = String(l.get('owner_id') || '')
      itens.push({
        nome: String(l.get('nome')),
        status: String(l.get('status')),
        dono_id: ow,
        dono: nomes[ow] || (ow === '' ? '(sem dono)' : ow),
      })
    }
    return e.json(200, { ok: true, total: itens.length, itens: itens })
  },
  $apis.requireAuth(),
)
