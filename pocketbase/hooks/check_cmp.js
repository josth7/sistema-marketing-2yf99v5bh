/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/cmp',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, enviadas: [], falhadas: [] }
    // as 2 que PASSARAM hoje (as minhas)
    for (const x of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "motivo='apresentacao_vendedor' && estado='enviado' && created>='2026-11-16 00:00'",
      '',
      10,
      0,
    ))
      out.enviadas.push({
        dest: String(x.get('destino_telefone') || '').slice(-6),
        leg: String(x.get('legenda') || ''),
        criado: String(x.get('created') || '').slice(11, 19),
      })
    // as que FALHARAM hoje
    for (const x of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "motivo='apresentacao_vendedor' && estado='erro_definitivo' && created>='2026-11-16 00:00'",
      '',
      20,
      0,
    ))
      out.falhadas.push({
        dest: String(x.get('destino_telefone') || '').slice(-6),
        leg: String(x.get('legenda') || ''),
        erro: String(x.get('ultimo_erro') || '').slice(0, 30),
        criado: String(x.get('created') || '').slice(11, 19),
      })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
