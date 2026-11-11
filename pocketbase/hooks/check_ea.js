routerAdd(
  'GET',
  '/backend/v1/check/estado-apres',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const envs = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_envios'),
      "motivo='apresentacao_vendedor' && created>='2026-11-11'",
      '',
      50,
      0,
    )
    const out = []
    var porEst = {}
    for (const en of envs) {
      const est = String(en.get('estado') || '')
      porEst[est] = (porEst[est] || 0) + 1
      out.push({
        est: est,
        erro: String(en.get('ultimo_erro') || '').slice(0, 40),
        dest: String(en.get('destino_telefone') || '').slice(-6),
        wamid: String(en.get('wa_message_id') || '') !== '' ? 'SIM' : 'nao',
        quando: String(en.get('created') || '').slice(11, 19),
      })
    }
    return e.json(200, { n: envs.length, por_estado: porEst, itens: out.slice(0, 6) })
  },
  $apis.requireAuth(),
)
