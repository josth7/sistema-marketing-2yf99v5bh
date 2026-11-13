/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/v1347',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = {
      ok: true,
      agora: new Date().toISOString().slice(0, 19),
      msgs: [],
      conversa: null,
      envios: [],
    }
    // 1. chegou alguma mensagem do 91562937 depois das 16:40 UTC (13:40 BRT)?
    const ms = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "contato_telefone~'91562937' && created>='2026-11-13 16:40'",
      '',
      50,
      0,
    )
    for (const m of ms)
      out.msgs.push({
        q: String(m.get('created') || '').slice(11, 19),
        dir: String(m.get('direcao') || ''),
        autor: String(m.get('autor') || ''),
        txt: String(m.get('texto') || '').slice(0, 40),
        status: String(m.get('status') || ''),
      })
    out.msgs.sort(function (a, b) {
      return a.q < b.q ? -1 : 1
    })
    out.total_novas = ms.length
    // 2. o estado da conversa agora
    const cvs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conversas'),
      "contato_telefone~'91562937'",
      '',
      10,
      0,
    )
    const centrais = {}
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true && fixture=false",
      '',
      5,
      0,
    ))
      centrais[c.id] = 1
    for (const c of cvs)
      if (centrais[String(c.get('conexao') || '')])
        out.conversa = {
          estado: String(c.get('estado') || ''),
          etapa: String(c.get('etapa_atual') || ''),
          autor: String(c.get('ultimo_autor') || ''),
          msgs: Number(c.get('total_mensagens') || 0),
          ia: String(c.get('ultima_resposta_ia_em') || '').slice(11, 19),
          ult: String(c.get('ultima_mensagem_em') || '').slice(11, 19),
        }
    // 3. envios para esse numero depois das 13:40
    const env = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "destino_telefone~'91562937' && created>='2026-11-13 16:40'",
      '',
      30,
      0,
    )
    for (const x of env)
      out.envios.push({
        q: String(x.get('created') || '').slice(11, 19),
        motivo: String(x.get('motivo') || ''),
        est: String(x.get('estado') || ''),
        erro: String(x.get('ultimo_erro') || '').slice(0, 40),
      })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
