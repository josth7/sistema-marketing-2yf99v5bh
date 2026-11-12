routerAdd(
  'GET',
  '/backend/v1/check/valor-empresa',
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
    for (const c of cs) {
      const raw = c.get('empresa')
      out.push({
        nome: String(c.get('nome_exibicao') || ''),
        id: c.id.slice(0, 10),
        empresa_raw: String(raw),
        empresa_tipo: typeof raw,
        empresa_len: raw ? String(raw).length : 0,
      })
    }
    return e.json(200, { centrais: out })
  },
  $apis.requireAuth(),
)
