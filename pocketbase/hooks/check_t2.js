/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/t2',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, conversa: null, mensagens: [], envios: [] }
    const cv = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conversas'),
      "contato_telefone~'9036170' && estado='triagem'",
      '',
      1,
      0,
    )
    if (cv.length > 0) {
      const c = cv[0]
      out.conversa = {
        estado: String(c.get('estado') || ''),
        autor: String(c.get('ultimo_autor') || ''),
        ia: String(c.get('ultima_resposta_ia_em') || '').slice(0, 19),
        msgs: Number(c.get('total_mensagens') || 0),
        etapa: String(c.get('roteiro_etapa') || ''),
        cx: String(c.get('conexao') || '').slice(0, 8),
      }
      const ms = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "conexao='" + String(c.get('conexao')) + "' && contato_telefone~'9036170'",
        '',
        40,
        0,
      )
      for (const m of ms)
        out.mensagens.push({
          q: String(m.get('created') || '').slice(11, 19),
          dir: String(m.get('direcao') || ''),
          autor: String(m.get('autor') || ''),
          txt: String(m.get('texto') || '').slice(0, 45),
        })
      out.mensagens.sort(function (a, b) {
        return a.q < b.q ? -1 : 1
      })
    }
    const env = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "destino_telefone~'9036170' && created>='2026-11-12 19:55'",
      '',
      30,
      0,
    )
    for (const x of env)
      out.envios.push({
        q: String(x.get('created') || '').slice(11, 19),
        motivo: String(x.get('motivo') || ''),
        estado: String(x.get('estado') || ''),
        erro: String(x.get('ultimo_erro') || '').slice(0, 40),
      })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
