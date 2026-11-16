/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/ft4',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, itens: [] }
    // os envios de teste que eu criei
    for (const x of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "dedupe_key~'ft3-'",
      '',
      10,
      0,
    ))
      out.itens.push({
        est: String(x.get('estado')),
        erro: String(x.get('ultimo_erro') || ''),
        tent: Number(x.get('tentativas') || 0),
        leg: String(x.get('legenda') || ''),
        wamid: String(x.get('wa_message_id') || '').slice(-10),
      })
    // e as apresentacoes de hoje
    var hoje = 0,
      ok2 = 0,
      comErro = 0
    for (const x of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "motivo='apresentacao_vendedor' && created>='2026-11-16 00:00'",
      '',
      50,
      0,
    )) {
      hoje++
      const st = String(x.get('estado'))
      if (st === 'enviado') ok2++
      if (st.indexOf('erro') >= 0) comErro++
    }
    out.apresentacoes_hoje = { total: hoje, enviadas: ok2, com_erro: comErro }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
