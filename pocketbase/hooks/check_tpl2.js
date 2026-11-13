/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/tpl2',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, por_sessao: [] }
    const cxs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "ativo=true && fixture=false && papel='vendedor'",
      '',
      10,
      0,
    )
    for (const c of cxs) {
      if (cxs.length > 0 && out.por_sessao.length >= 2) break
      var chave = ''
      try {
        const n = String(c.get('nome_segredo_chave') || '')
        if (n !== '') chave = String($secrets.get(n) || '')
      } catch (x) {}
      const sess = String(c.get('session_id') || '')
      if (chave === '' || sess === '') continue
      const item = {
        nome: String(c.get('nome_exibicao') || ''),
        modelo: String(c.get('modelo_apresentacao_vendedor') || ''),
      }
      // rota CORRETA: /api/v1/connections/cloud-api/{id}/templates/all
      var st = 0,
        resp = ''
      try {
        const r = $http.send({
          url: 'https://api.d-api.cloud/api/v1/connections/cloud-api/' + sess + '/templates/all',
          method: 'GET',
          headers: { Authorization: chave },
          timeout: 22,
        })
        st = Number(r.statusCode || 0)
        var rb = r.body
        resp = Array.isArray(rb) ? String.fromCharCode.apply(null, rb) : String(rb)
      } catch (e2) {
        resp = 'exc: ' + String(e2).slice(0, 60)
      }
      item.status = st
      item.resposta = resp.replace(/[0-9]{10,}/g, '***').slice(0, 700)
      out.por_sessao.push(item)
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
