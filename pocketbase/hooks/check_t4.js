/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/t4',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true }
    // a apresentacao do vendedor saiu? (o item que faltava)
    const ap = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "motivo='apresentacao_vendedor' && created>='2026-11-12 19:55'",
      '',
      30,
      0,
    )
    out.apresentacoes = ap.length
    out.det_ap = []
    for (const x of ap)
      out.det_ap.push({
        q: String(x.get('created') || '').slice(11, 19),
        estado: String(x.get('estado') || ''),
        erro: String(x.get('ultimo_erro') || '').slice(0, 45),
        dest: String(x.get('destino_telefone') || '').slice(-6),
      })
    // o aviso ao cliente (transferencia) saiu?
    const av = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "motivo='aviso_cliente' && created>='2026-11-12 19:55'",
      '',
      30,
      0,
    )
    out.avisos_cliente = av.length
    for (const x of av)
      out.det_av = (out.det_av || []).concat([
        {
          q: String(x.get('created') || '').slice(11, 19),
          estado: String(x.get('estado') || ''),
          erro: String(x.get('ultimo_erro') || '').slice(0, 45),
        },
      ])
    // o lead ficou com quem?
    const l = app.findRecordsByFilter(
      app.findCollectionByNameOrId('crm_leads'),
      "telefone~'9036170'",
      '',
      5,
      0,
    )
    out.leads = []
    for (const x of l) {
      var dono = ''
      try {
        dono = String(app.findRecordById('users', String(x.get('owner_id'))).get('name') || '')
      } catch (e) {}
      out.leads.push({
        nome: String(x.get('nome') || ''),
        status: String(x.get('status') || ''),
        dono: dono,
        nota: x.get('ia_nota'),
      })
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
