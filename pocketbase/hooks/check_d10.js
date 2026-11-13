/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/d10',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, conversa: null, mensagens: [], envios: [], etapa_campo: [] }
    const cvs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conversas'),
      "contato_telefone~'9036170'",
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
    var alvo = null
    for (const c of cvs) if (centrais[String(c.get('conexao') || '')]) alvo = c
    if (!alvo) return e.json(200, { ok: false, erro: 'sem conversa na central' })
    out.conversa = {
      estado: String(alvo.get('estado') || ''),
      autor: String(alvo.get('ultimo_autor') || ''),
      ia: String(alvo.get('ultima_resposta_ia_em') || '').slice(0, 19),
      ult: String(alvo.get('ultima_mensagem_em') || '').slice(0, 19),
      msgs: Number(alvo.get('total_mensagens') || 0),
      lead: String(alvo.get('lead') || '').slice(0, 10),
    }
    // campos de etapa (descobrir o nome real)
    try {
      const det = app.findCollectionByNameOrId('whatsapp_conversas')
      for (const f of det.fields || []) {
        const n = String(f.name)
        if (n.indexOf('etapa') >= 0 || n.indexOf('roteiro') >= 0 || n.indexOf('passo') >= 0)
          out.etapa_campo.push(n + ': ' + String(alvo.get(n) || ''))
      }
    } catch (e1) {}
    const ms = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "conexao='" + String(alvo.get('conexao')) + "' && contato_telefone~'9036170'",
      '',
      60,
      0,
    )
    for (const m of ms)
      out.mensagens.push({
        q: String(m.get('created') || '').slice(11, 19),
        dir: String(m.get('direcao') || ''),
        autor: String(m.get('autor') || ''),
        txt: String(m.get('texto') || '').slice(0, 35),
      })
    out.mensagens.sort(function (a, b) {
      return a.q < b.q ? -1 : 1
    })
    const env = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "destino_telefone~'9036170' && created>='2026-11-13 12:00'",
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
