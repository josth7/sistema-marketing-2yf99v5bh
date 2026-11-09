routerAdd(
  'GET',
  '/backend/v1/diag/apres-400',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const col = $app.findCollectionByNameOrId('whatsapp_envios')
    const es = $app.findRecordsByFilter(col, "motivo='apresentacao_vendedor'", '', 5, 0)
    const out = []
    for (const en of es) {
      out.push({
        conexao: String(en.get('conexao') || '').slice(0, 10),
        modelo: String(en.get('modelo_nome') || ''),
        legenda: String(en.get('legenda') || '').slice(0, 40),
        idioma: String(en.get('modelo_idioma') || '(vazio)'),
        destino: String(en.get('destino_telefone') || ''),
        estado: String(en.get('estado') || ''),
        err: String(en.get('ultimo_erro') || '').slice(0, 60),
      })
    }
    return e.json(200, { n: es.length, itens: out })
  },
  $apis.requireAuth(),
)
