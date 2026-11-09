routerAdd(
  'GET',
  '/backend/v1/diag/erros-vendedor',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const col = $app.findCollectionByNameOrId('whatsapp_envios')
    const es = $app.findRecordsByFilter(col, "motivo='vendedor_resposta'", '', 100, 0)
    const out = []
    for (const en of es) {
      out.push({
        estado: String(en.get('estado') || ''),
        ultimo_erro: String(en.get('ultimo_erro') || '').slice(0, 80),
        criado: String(en.get('created') || '').slice(0, 16),
      })
    }
    return e.json(200, { n: es.length, itens: out })
  },
  $apis.requireAuth(),
)
