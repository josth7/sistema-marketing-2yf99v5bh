routerAdd(
  'GET',
  '/backend/v1/check/130497-hoje',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    // TODOS os message.failed de hoje: quantos sao 130497 e quantos 131047?
    const evs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_eventos'),
      "evento='message.failed' && created>='2026-11-12'",
      '',
      300,
      0,
    )
    var c130497 = 0,
      c131047 = 0,
      outros = 0
    var ultimo130497 = ''
    for (const x of evs) {
      const c = String(x.get('codigo_erro') || '')
      const q = String(x.get('created') || '').slice(11, 19)
      if (c.indexOf('130497') >= 0 || c.indexOf('restricted from messaging') >= 0) {
        c130497++
        if (q > ultimo130497) ultimo130497 = q
      } else if (c.indexOf('131047') >= 0) c131047++
      else outros++
    }
    // e quantos foram entregues hoje?
    const ok = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_eventos'),
      "evento='message.delivered' && created>='2026-11-12'",
      '',
      300,
      0,
    )
    const rd = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_eventos'),
      "evento='message.read' && created>='2026-11-12'",
      '',
      300,
      0,
    )
    return e.json(200, {
      total_failed: evs.length,
      bloqueio_130497: c130497,
      reengagement_131047: c131047,
      outros: outros,
      ultimo_130497: ultimo130497,
      entregues: ok.length,
      lidas: rd.length,
    })
  },
  $apis.requireAuth(),
)
