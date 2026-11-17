/// <reference path="../pb_data/types.d.ts" />
// cria o pedido de transferencia pela API do PocketBase (dispara o hook)
routerAdd(
  'GET',
  '/backend/v1/check/cria-transf-api',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true }
    const leadId = String(e.request.url.query().get('lead') || '')
    if (leadId === '') return e.json(400, { ok: false, erro: 'informe ?lead=' })
    // cria via HTTP interno para disparar onRecordAfterCreateSuccess
    try {
      const base = String(
        $secrets.get('PB_INSTANCE_URL') ||
          'https://sistema-marketing-1f51e.shrd00.internal.goskip.dev',
      )
      const r = $http.send({
        url: base + '/api/collections/whatsapp_transferencias/records',
        method: 'POST',
        headers: { 'Content-Type': 'application/json' }, // sem token: colecao pode ser fechada
        body: JSON.stringify({
          lead: leadId,
          motivo: 'fora_do_roteiro',
          estado: 'pendente',
          fixture: true,
        }),
        timeout: 20,
      })
      out.status = Number(r.statusCode || 0)
      var rb = r.body
      out.resp = Array.isArray(rb) ? String.fromCharCode.apply(null, rb) : String(rb)
      out.resp = String(out.resp).slice(0, 200)
    } catch (e1) {
      out.erro = String(e1).slice(0, 120)
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
