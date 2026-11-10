routerAdd(
  'GET',
  '/backend/v1/diag/avisos-gerados',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const col = $app.findCollectionByNameOrId('whatsapp_envios')
    const es = $app.findRecordsByFilter(col, "motivo='aviso_vendedor'", '', 50, 0)
    const out = []
    for (const en of es) {
      out.push({
        estado: String(en.get('estado') || ''),
        destino: String(en.get('destino_telefone') || '').slice(-6),
        criado: String(en.get('created') || '').slice(0, 16),
        texto: String(en.get('texto') || '').slice(0, 80),
      })
    }
    return e.json(200, { n: es.length, itens: out })
  },
  $apis.requireAuth(),
)
