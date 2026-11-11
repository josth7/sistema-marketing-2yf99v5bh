routerAdd(
  'GET',
  '/backend/v1/check/erro-fila-apres',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const envs = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_envios'),
      "motivo='apresentacao_vendedor' && created>='2026-11-11' && estado!='pendente'",
      '',
      30,
      0,
    )
    const out = []
    for (const en of envs)
      out.push({
        est: String(en.get('estado') || ''),
        erro: String(en.get('ultimo_erro') || ''),
        tent: Number(en.get('tentativas') || 0),
        dest: String(en.get('destino_telefone') || '').slice(-6),
        quando: String(en.get('created') || '').slice(11, 19),
      })
    return e.json(200, { n: envs.length, itens: out.slice(0, 4) })
  },
  $apis.requireAuth(),
)
