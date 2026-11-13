/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/ult',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, agora_utc: new Date().toISOString().slice(0, 19) }
    // as 5 ultimas mensagens RECEBIDAS (qualquer numero)
    const ms = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "direcao='entrada' && created>='2026-11-13 15:30'",
      '',
      300,
      0,
    )
    var ult = []
    for (const m of ms)
      ult.push(
        String(m.get('created') || '').slice(11, 19) +
          ' ' +
          String(m.get('contato_telefone') || '').slice(-6) +
          ' ' +
          String(m.get('texto') || '').slice(0, 18),
      )
    ult.sort()
    out.ultimas = ult.slice(-5)
    out.total_desde_1530 = ms.length
    // algum 2937?
    var achou = false
    for (const m of ms)
      if (String(m.get('contato_telefone') || '').indexOf('2937') >= 0) achou = true
    out.tem_2937 = achou
    // TODAS as conversas desse numero (todas as conexoes)
    const cvs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conversas'),
      "contato_telefone~'91562937'",
      '',
      10,
      0,
    )
    const nomes = {}
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      '',
      '',
      60,
      0,
    ))
      nomes[c.id] = String(c.get('nome_exibicao') || '')
    out.conversas = []
    for (const c of cvs)
      out.conversas.push({
        cx: nomes[String(c.get('conexao') || '')] || '?',
        estado: String(c.get('estado') || ''),
        msgs: Number(c.get('total_mensagens') || 0),
        ult: String(c.get('ultima_mensagem_em') || '').slice(0, 16),
      })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
