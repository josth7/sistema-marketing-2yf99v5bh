/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/v2',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = {
      ok: true,
      agora_utc: new Date().toISOString().slice(11, 19),
      msgs: [],
      conversa: null,
      envios: [],
    }
    // TODAS as mensagens desse numero hoje (sem filtro de hora - evita erro de UTC)
    const ms = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "contato_telefone~'91562937'",
      '',
      100,
      0,
    )
    for (const m of ms)
      out.msgs.push({
        q: String(m.get('created') || '').slice(5, 19),
        dir: String(m.get('direcao') || ''),
        autor: String(m.get('autor') || ''),
        txt: String(m.get('texto') || '').slice(0, 35),
      })
    out.msgs.sort(function (a, b) {
      return a.q < b.q ? -1 : 1
    })
    out.total = ms.length
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
          ia: String(c.get('ultima_resposta_ia_em') || '').slice(5, 19),
          ult: String(c.get('ultima_mensagem_em') || '').slice(5, 19),
          canal: String(c.get('canal') || ''),
        }
    const env = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "destino_telefone~'91562937'",
      '',
      30,
      0,
    )
    for (const x of env)
      out.envios.push({
        q: String(x.get('created') || '').slice(5, 19),
        motivo: String(x.get('motivo') || ''),
        est: String(x.get('estado') || ''),
        erro: String(x.get('ultimo_erro') || '').slice(0, 40),
      })
    out.envios.sort(function (a, b) {
      return a.q < b.q ? -1 : 1
    })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
