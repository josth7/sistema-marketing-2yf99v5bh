/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/tpl-dest',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, testes: [] }
    const cs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='vendedor' && ativo=true && fixture=false && apresentacao_ativa=true",
      '',
      1,
      0,
    )
    if (!cs.length) return e.json(200, { ok: false })
    const c = cs[0]
    var chave = ''
    try {
      const n = String(c.get('nome_segredo_chave') || '')
      if (n !== '') chave = String($secrets.get(n) || '')
    } catch (x) {}
    const sess = String(c.get('session_id') || '')
    const modelo = String(c.get('modelo_apresentacao_vendedor') || '')
    // 1. testa com o MEU numero (o que funcionou)
    // 2. testa com o numero que a fila usou (206353 = Douglas)
    const alvos = [
      ['5541999601233', 'meu teste'],
      ['554197206353', 'Douglas (fila falhou)'],
    ]
    for (const [tel, rot] of alvos) {
      var st = 0,
        resp = ''
      try {
        const r = $http.send({
          url: 'https://api.d-api.cloud/api/v1/messages/send/template',
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: chave },
          body: JSON.stringify({
            sessionId: sess,
            to: tel,
            template: { name: modelo, language: 'pt_BR', bodyVariables: ['Teste', 'Fábio Teles'] },
          }),
          timeout: 20,
        })
        st = Number(r.statusCode || 0)
        var rb = r.body
        resp = Array.isArray(rb) ? String.fromCharCode.apply(null, rb) : String(rb)
      } catch (e1) {
        resp = 'exc: ' + String(e1).slice(0, 60)
      }
      out.testes.push({
        alvo: rot,
        status: st,
        resp: resp.replace(/[0-9]{10,}/g, '***').slice(0, 160),
      })
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
