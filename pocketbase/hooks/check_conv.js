routerAdd(
  'GET',
  '/backend/v1/check/conversa-teste',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const cvs = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_conversas'),
      "estado='triagem'",
      '',
      2000,
      0,
    )
    var alvo = null
    for (const c of cvs) {
      const t = String(c.get('contato_telefone') || '')
      if (t.indexOf('036170') >= 0) {
        alvo = c
        break
      }
    }
    if (!alvo) return e.json(200, { ok: false, erro: 'conversa nao achada' })
    const msgs = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_mensagens'),
      "conexao='" +
        String(alvo.get('conexao')) +
        "' && contato_telefone='" +
        String(alvo.get('contato_telefone')) +
        "'",
      '',
      40,
      0,
    )
    const out = []
    for (const m of msgs)
      out.push({
        dir: String(m.get('direcao') || ''),
        autor: String(m.get('autor') || ''),
        texto: String(m.get('texto') || '').slice(0, 80),
        quando: String(m.get('created') || '').slice(11, 19),
      })
    out.sort(function (a, b) {
      return a.quando < b.quando ? -1 : 1
    })
    return e.json(200, {
      ok: true,
      conversa: {
        tel: String(alvo.get('contato_telefone') || ''),
        estado: String(alvo.get('estado') || ''),
        msgs: Number(alvo.get('total_mensagens') || 0),
        ultimo_autor: String(alvo.get('ultimo_autor') || ''),
        ultima_ia: String(alvo.get('ultima_resposta_ia_em') || '').slice(0, 19),
      },
      mensagens: out,
    })
  },
  $apis.requireAuth(),
)
