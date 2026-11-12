/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/t1709',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, agora: new Date().toISOString().slice(0, 19) }
    // 1. a mensagem "teste 2" entrou? (20:00 UTC = 17:00 BRT)
    const ms = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "direcao='entrada' && created>='2026-11-12 19:55'",
      '',
      200,
      0,
    )
    const lst = []
    for (const m of ms)
      lst.push({
        q: String(m.get('created') || '').slice(11, 19),
        tel: String(m.get('contato_telefone') || '').slice(-6),
        txt: String(m.get('texto') || '').slice(0, 30),
        cx: String(m.get('conexao') || '').slice(0, 8),
      })
    lst.sort(function (a, b) {
      return a.q < b.q ? 1 : -1
    })
    out.entradas = lst.slice(0, 8)
    out.total_entradas = ms.length
    // 2. o estado das conversas desses telefones
    out.conversas = []
    const vistos = {}
    for (const x of lst) {
      if (vistos[x.tel]) continue
      vistos[x.tel] = true
      try {
        const cv = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_conversas'),
          "contato_telefone~'" + x.tel + "'",
          '',
          5,
          0,
        )
        for (const c of cv)
          out.conversas.push({
            tel: x.tel,
            estado: String(c.get('estado') || ''),
            autor: String(c.get('ultimo_autor') || ''),
            ia: String(c.get('ultima_resposta_ia_em') || '').slice(11, 19),
            msgs: Number(c.get('total_mensagens') || 0),
          })
      } catch (e1) {}
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
