routerAdd(
  'GET',
  '/backend/v1/check/porque-fila-falha',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const cx = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='vendedor' && ativo=true && apresentacao_ativa=true",
      '',
      1,
      0,
    )
    if (!cx.length) return e.json(200, { ok: false, erro: 'sem conexao' })
    const c = cx[0]
    var chave = ''
    try {
      const nc = String(c.get('nome_segredo_chave') || '')
      if (nc !== '') chave = String($secrets.get(nc) || '')
    } catch (e1) {}
    const out = {
      ok: true,
      numero: String(c.get('nome_exibicao') || ''),
      secao: String(c.get('nome_segredo_chave') || ''),
      tem_chave: chave !== '',
      session: String(c.get('session_id') || '').slice(0, 20),
      modelo: String(c.get('modelo_apresentacao_vendedor') || ''),
    }
    // o corpo que a FILA monta (com legenda "Anezia|Fabio")
    var st = 0,
      resp = ''
    try {
      const r = $http.send({
        url: 'https://api.d-api.cloud/api/v1/messages/send/template',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: chave },
        body: JSON.stringify({
          sessionId: String(c.get('session_id') || ''),
          to: '5541999601233',
          template: {
            name: String(c.get('modelo_apresentacao_vendedor') || ''),
            language: 'pt_BR',
            bodyVariables: ['Anezia', 'Fabio'],
          },
        }),
        timeout: 22,
      })
      st = Number(r.statusCode || 0)
      var rb = r.body
      if (Array.isArray(rb)) rb = String.fromCharCode.apply(null, rb)
      resp = String(rb)
    } catch (e2) {
      resp = 'exc: ' + String(e2).slice(0, 60)
    }
    out.teste = { status: st, resposta: resp.replace(/[0-9]{10,}/g, '***').slice(0, 200) }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
