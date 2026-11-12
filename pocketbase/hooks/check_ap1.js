/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/ap-teste',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, frases: [] }
    // o aviso ao cliente do teste das 17:09 tem a palavra wa.me/ no texto?
    const env = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "contato_telefone~'9036170'",
      '',
      30,
      0,
    )
    // o campo do telefone destino pode ser outro nome; busca por motivo
    const av = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "motivo='aviso_cliente' && created>='2026-11-12 19:55'",
      '',
      50,
      0,
    )
    for (const x of av) {
      const txt = String(x.get('texto') || '')
      out.frases.push({
        q: String(x.get('created') || '').slice(11, 19),
        dest: String(x.get('destino_telefone') || '').slice(-6),
        estado: String(x.get('estado') || ''),
        tem_wame: txt.indexOf('wa.me/') >= 0,
        lead: String(x.get('lead') || '').slice(0, 10),
        texto: txt.slice(0, 70),
      })
    }
    // quantos avisos com wa.me nas ultimas 2h (a janela do cron)
    out.avisos_com_wame = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "motivo='aviso_cliente' && texto~'wa.me/' && created>='2026-11-12 18:15'",
      '',
      100,
      0,
    ).length
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
