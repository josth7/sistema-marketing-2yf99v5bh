/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/ap2',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, todos: [], com_wame: 0 }
    var av = []
    try {
      av = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        "motivo='aviso_cliente' && created>='2026-11-12 18:30'",
        '',
        100,
        0,
      )
    } catch (x) {
      out.erro = String(x).slice(0, 80)
    }
    for (const x of av) {
      const txt = String(x.get('texto') || '')
      if (txt.indexOf('wa.me/') >= 0) out.com_wame++
      if (out.todos.length < 6)
        out.todos.push({
          q: String(x.get('created') || '').slice(11, 19),
          dest: String(x.get('destino_telefone') || '').slice(-6),
          tem_wame: txt.indexOf('wa.me/') >= 0,
          txt: txt.slice(0, 60),
        })
    }
    out.total_avisos = av.length
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
