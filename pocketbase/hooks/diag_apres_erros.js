routerAdd(
  'GET',
  '/backend/v1/diag/erros-apres',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const col = $app.findCollectionByNameOrId('whatsapp_envios')
    const out = {}
    for (const m of ['apresentacao_vendedor', 'aviso_vendedor']) {
      const es = $app.findRecordsByFilter(col, "motivo='" + m + "'", '', 200, 0)
      const det = []
      for (const en of es) {
        det.push({
          est: String(en.get('estado') || ''),
          erro: String(en.get('ultimo_erro') || '').slice(0, 90),
          criado: String(en.get('created') || '').slice(0, 16),
        })
      }
      out[m] = det
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
