/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/d11',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, agora: new Date().toISOString().slice(0, 19) }
    // todos os envios desse numero hoje (12h+)
    const env = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "destino_telefone~'9036170' && created>='2026-11-13 12:30'",
      '',
      50,
      0,
    )
    out.envios = []
    for (const x of env)
      out.envios.push({
        q: String(x.get('created') || '').slice(11, 19),
        motivo: String(x.get('motivo') || ''),
        est: String(x.get('estado') || ''),
        erro: String(x.get('ultimo_erro') || '').slice(0, 45),
        texto: String(x.get('texto') || '').slice(0, 40),
        legenda: String(x.get('legenda') || '(vazio)').slice(0, 30),
      })
    out.envios.sort(function (a, b) {
      return a.q < b.q ? -1 : 1
    })
    // a IA falou algo depois das 12:51?
    const ia = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "motivo='ia_resposta' && created>='2026-11-13 12:49'",
      '',
      40,
      0,
    )
    out.ia_depois = []
    for (const x of ia)
      out.ia_depois.push({
        q: String(x.get('created') || '').slice(11, 19),
        est: String(x.get('estado') || ''),
        dest: String(x.get('destino_telefone') || '').slice(-6),
        erro: String(x.get('ultimo_erro') || '').slice(0, 40),
      })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
