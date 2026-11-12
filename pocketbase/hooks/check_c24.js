routerAdd(
  'GET',
  '/backend/v1/check/central-24h',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    var central = ''
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true",
      '',
      1,
      0,
    ))
      central = c.id
    const ent = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "conexao='" + central + "' && direcao='entrada' && created>='2026-11-11 20:00'",
      '',
      200,
      0,
    )
    const sai = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "conexao='" + central + "' && direcao='saida' && created>='2026-11-11 20:00'",
      '',
      200,
      0,
    )
    var iaSai = 0
    for (const s of sai) if (String(s.get('autor')) === 'ia') iaSai++
    return e.json(200, {
      ok: true,
      entrada_central: ent.length,
      saida_central: sai.length,
      saida_ia: iaSai,
    })
  },
  $apis.requireAuth(),
)
