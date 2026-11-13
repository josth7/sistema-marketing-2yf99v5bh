/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/tpl1',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, sessoes: [] }
    const cxs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      'ativo=true && fixture=false',
      '',
      20,
      0,
    )
    for (const c of cxs) {
      var chave = ''
      try {
        const n = String(c.get('nome_segredo_chave') || '')
        if (n !== '') chave = String($secrets.get(n) || '')
      } catch (x) {}
      if (chave === '') continue
      const sess = String(c.get('session_id') || '')
      const item = {
        nome: String(c.get('nome_exibicao') || ''),
        papel: String(c.get('papel') || ''),
        modelo: String(c.get('modelo_apresentacao_vendedor') || ''),
        idioma: String(c.get('modelo_idioma') || '(vazio)'),
        apresentacao: c.get('apresentacao_ativa') === true,
      }
      // tenta listar templates da sessao
      var st = 0,
        resp = ''
      try {
        const r = $http.send({
          url: 'https://api.d-api.cloud/api/v1/templates?sessionId=' + sess,
          method: 'GET',
          headers: { Authorization: chave },
          timeout: 18,
        })
        st = Number(r.statusCode || 0)
        var rb = r.body
        resp = Array.isArray(rb) ? String.fromCharCode.apply(null, rb) : String(rb)
      } catch (e2) {
        resp = 'exc: ' + String(e2).slice(0, 50)
      }
      item.templates_status = st
      item.templates_resp = resp.replace(/[0-9]{10,}/g, '***').slice(0, 300)
      out.sessoes.push(item)
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
