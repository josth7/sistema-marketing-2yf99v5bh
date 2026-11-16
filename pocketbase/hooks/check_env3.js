/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/env3',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, itens: [] }
    for (const tel of ['413993', '633012', '081854']) {
      for (const x of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        "destino_telefone~'" + tel + "' && created>='2026-11-16 12:00'",
        '',
        10,
        0,
      ))
        out.itens.push({
          tel: tel,
          q: String(x.get('created') || '').slice(11, 19),
          mot: String(x.get('motivo') || ''),
          est: String(x.get('estado') || ''),
          erro: String(x.get('ultimo_erro') || '').slice(0, 40),
          txt: String(x.get('texto') || '').slice(0, 40),
        })
    }
    out.itens.sort(function (a, b) {
      return a.q < b.q ? -1 : 1
    })
    // as saidas gravadas hoje na central (a correcao de ontem funciona?)
    var central = null
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true && fixture=false",
      '',
      1,
      0,
    ))
      central = c
    if (central) {
      const s = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "conexao='" + central.id + "' && direcao='saida' && created>='2026-11-16 00:00'",
        '',
        100,
        0,
      )
      out.saidas_historico_hoje = s.length
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
