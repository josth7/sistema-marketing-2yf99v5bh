routerAdd(
  'GET',
  '/backend/v1/check/fila-ia',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const envs = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_envios'),
      "motivo='ia_resposta'",
      '',
      100,
      0,
    )
    const out = []
    for (const en of envs)
      out.push({
        estado: String(en.get('estado') || ''),
        erro: String(en.get('ultimo_erro') || '').slice(0, 60),
        dest: String(en.get('destino_telefone') || '').slice(-6),
        quando: String(en.get('created') || '').slice(11, 19),
        texto: String(en.get('texto') || '').slice(0, 50),
      })
    return e.json(200, { n: envs.length, itens: out.slice(0, 6) })
  },
  $apis.requireAuth(),
)
