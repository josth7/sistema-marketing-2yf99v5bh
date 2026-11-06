routerAdd(
  'GET',
  '/backend/v1/diag/uma-conv',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const id = String(e.request.url.query().get('id') || '')
    var c = null
    try {
      c = $app.findRecordById('whatsapp_conversas', id)
    } catch (err) {
      return e.json(404, { ok: false })
    }
    return e.json(200, {
      ok: true,
      conexao: String(c.get('conexao')),
      tel: String(c.get('contato_telefone')),
      lead: String(c.get('lead')),
      interna: String(c.get('interna')),
      nao_cliente: String(c.get('nao_cliente')),
      estado: String(c.get('estado')),
      fixture: String(c.get('fixture')),
    })
  },
  $apis.requireAuth(),
)
