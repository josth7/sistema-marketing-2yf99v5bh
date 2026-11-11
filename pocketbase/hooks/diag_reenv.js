routerAdd(
  'GET',
  '/backend/v1/diag/reenvia-aviso',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const es = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_envios'),
      "motivo='aviso_vendedor' && estado='erro_definitivo' && created>='2026-11-10'",
      '',
      5,
      0,
    )
    var n = 0
    for (const en of es) {
      if (n >= 2) break
      en.set('estado', 'pendente')
      en.set('tentativas', 0)
      en.set('ultimo_erro', '')
      en.set('dedupe_key', String(en.get('dedupe_key') || '') + '|r' + String(Date.now()) + n)
      $app.save(en)
      n++
    }
    return e.json(200, { ok: true, reenfileirados: n })
  },
  $apis.requireAuth(),
)
