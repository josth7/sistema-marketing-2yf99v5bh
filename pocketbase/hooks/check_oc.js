routerAdd(
  'GET',
  '/backend/v1/check/ordem-central',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const cs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true",
      '',
      5,
      0,
    )
    const out = []
    for (const c of cs)
      out.push({
        nome: String(c.get('nome_exibicao') || ''),
        id: c.id.slice(0, 10),
        fixture: String(c.get('fixture')),
        empresa: String(c.get('empresa') || '').slice(0, 8),
      })
    return e.json(200, { ordem: out, primeira: out.length > 0 ? out[0].nome : '(nenhuma)' })
  },
  $apis.requireAuth(),
)
