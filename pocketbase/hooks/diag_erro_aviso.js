routerAdd(
  'GET',
  '/backend/v1/diag/erro-aviso',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const es = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_envios'),
      "motivo='aviso_vendedor' && created>='2026-11-10'",
      '',
      20,
      0,
    )
    const out = []
    for (const en of es)
      out.push({
        est: String(en.get('estado')),
        err: String(en.get('ultimo_erro') || '').slice(0, 90),
        dest: String(en.get('destino_telefone') || '').slice(-6),
      })
    return e.json(200, { n: es.length, itens: out })
  },
  $apis.requireAuth(),
)
