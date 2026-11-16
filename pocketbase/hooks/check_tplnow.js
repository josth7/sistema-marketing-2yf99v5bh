/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/tpl-agora',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true }
    const cs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='vendedor' && ativo=true && fixture=false && apresentacao_ativa=true",
      '',
      1,
      0,
    )
    if (!cs.length) return e.json(200, { ok: false, erro: 'sem vendedor' })
    const c = cs[0]
    var chave = ''
    try {
      const n = String(c.get('nome_segredo_chave') || '')
      if (n !== '') chave = String($secrets.get(n) || '')
    } catch (x) {}
    const sess = String(c.get('session_id') || '')
    const modelo = String(c.get('modelo_apresentacao_vendedor') || '')
    out.vendedor = String(c.get('nome_exibicao') || '')
    out.modelo = modelo
    // POST igual ao da fila
    var st = 0,
      resp = ''
    try {
      const r = $http.send({
        url: 'https://api.d-api.cloud/api/v1/messages/send/template',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: chave },
        body: JSON.stringify({
          sessionId: sess,
          to: '5541999601233',
          template: { name: modelo, language: 'pt_BR', bodyVariables: ['Teste', 'Anezia'] },
        }),
        timeout: 22,
      })
      st = Number(r.statusCode || 0)
      var rb = r.body
      resp = Array.isArray(rb) ? String.fromCharCode.apply(null, rb) : String(rb)
    } catch (e1) {
      resp = 'excecao: ' + String(e1).slice(0, 70)
    }
    out.status = st
    out.resposta = resp.replace(/[0-9]{10,}/g, '***').slice(0, 300)
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
