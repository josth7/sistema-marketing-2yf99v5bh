routerAdd(
  'GET',
  '/backend/v1/check/motivos-ia',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    // quais motivos o roteiro usa ao enfileirar?
    const envs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      '',
      '',
      300,
      0,
    )
    const porMotivo = {}
    for (const en of envs) {
      const m = String(en.get('motivo') || '?')
      porMotivo[m] = (porMotivo[m] || 0) + 1
    }
    return e.json(200, { por_motivo: porMotivo })
  },
  $apis.requireAuth(),
)
