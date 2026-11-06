routerAdd(
  'GET',
  '/backend/v1/diag/resumo-bruto',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const col = $app.findCollectionByNameOrId('whatsapp_envios')
    const r = $app.findRecordsByFilter(col, "motivo='resumo_gestao'", '', 5, 0)
    const out = []
    for (const x of r) {
      out.push({
        d: x.get('destino_telefone'),
        e: x.get('estado'),
        m: x.get('modo'),
        t: String(x.get('texto') || '').slice(0, 300),
        k: x.get('dedupe_key'),
      })
    }
    return e.json(200, { ok: true, n: r.length, itens: out })
  },
  $apis.requireAuth(),
)
