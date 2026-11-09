routerAdd(
  'POST',
  '/backend/v1/diag/limpa-testes-apres',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const col = $app.findCollectionByNameOrId('whatsapp_envios')
    var n = 0
    const es = $app.findRecordsByFilter(col, 'fixture=true', '', 200, 0)
    for (const en of es) {
      try {
        app.delete(en)
        n++
      } catch (x) {}
    }
    return e.json(200, { ok: true, removidos: n })
  },
  $apis.requireAuth(),
)
