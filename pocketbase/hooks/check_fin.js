routerAdd(
  'GET',
  '/backend/v1/check/final',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    var central = ''
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true && fixture=false",
      '',
      1,
      0,
    ))
      central = c.id
    const tri = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conversas'),
      "conexao='" + central + "' && estado='triagem'",
      '',
      500,
      0,
    )
    return e.json(200, { triagem_central: tri.length })
  },
  $apis.requireAuth(),
)
