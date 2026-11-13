/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/d13',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true }
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
    if (!alvo) return e.json(200, { ok: false })
    const cv = alvo
    // a ultima mensagem RECEBIDA (o que o cron pega)
    const ms = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "conexao='" + String(cv.get('conexao')) + "' && contato_telefone~'9036170'",
      '',
      80,
      0,
    )
    var ult = null
    for (const m of ms) {
      if (!ult || String(m.get('created') || '') > String(ult.get('created') || '')) ult = m
    }
    out.ultima_msg = {
      q: String(ult.get('created') || ''),
      dir: String(ult.get('direcao') || ''),
      autor: String(ult.get('autor') || ''),
      txt: String(ult.get('texto') || '').slice(0, 25),
    }
    out.ultima_ia = String(cv.get('ultima_resposta_ia_em') || '')
    // A COMPARACAO QUE O CRON FAZ:
    const ultimaIa = String(cv.get('ultima_resposta_ia_em') || '')
    const criadaMsg = String(ult.get('created') || '')
    out.comparacao = {
      ultimaIa: ultimaIa,
      criadaMsg: criadaMsg,
      bloqueia: ultimaIa !== '' && criadaMsg !== '' && ultimaIa >= criadaMsg,
    }
    // o estado
    out.estado = String(cv.get('estado') || '')
    out.etapa = String(cv.get('etapa_atual') || '')
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
