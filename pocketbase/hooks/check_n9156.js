/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/n9156',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, conversas: [], total_msgs: 0 }
    const centrais = {}
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true && fixture=false",
      '',
      5,
      0,
    ))
      centrais[c.id] = String(c.get('nome_exibicao') || '')
    // variacoes do telefone
    const cvs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conversas'),
      "contato_telefone~'91562937'",
      '',
      10,
      0,
    )
    for (const c of cvs)
      out.conversas.push({
        tel: String(c.get('contato_telefone') || ''),
        papel: centrais[String(c.get('conexao') || '')] ? 'central' : 'vendedor',
        conexao: centrais[String(c.get('conexao') || '')] || 'vendedor',
        estado: String(c.get('estado') || ''),
        msgs: Number(c.get('total_mensagens') || 0),
        etapa: String(c.get('etapa_atual') || ''),
        autor: String(c.get('ultimo_autor') || ''),
        fixture: String(c.get('fixture')),
      })
    // total de mensagens desse numero (para saber se a conversa e "longa")
    try {
      const ms = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "contato_telefone~'91562937'",
        '',
        300,
        0,
      )
      out.total_msgs = ms.length
    } catch (e1) {}
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
