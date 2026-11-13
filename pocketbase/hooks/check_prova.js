/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/prova',
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
    // O QUE O CRON FAZ: limit 12, sem sort
    const doze = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "conexao='" +
        String(alvo.get('conexao')) +
        "' && contato_telefone='" +
        String(alvo.get('contato_telefone')) +
        "'",
      '',
      12,
      0,
    )
    const lst = []
    for (const m of doze)
      lst.push(
        String(m.get('created') || '').slice(11, 19) +
          ' ' +
          String(m.get('direcao') || '') +
          ' ' +
          String(m.get('texto') || '').slice(0, 12),
      )
    lst.sort().reverse()
    out.limit_12 = lst
    out.mais_recente_dos_12 = lst[0]
    // TODAS (80) - a mais recente de verdade
    const todas = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "conexao='" +
        String(alvo.get('conexao')) +
        "' && contato_telefone='" +
        String(alvo.get('contato_telefone')) +
        "'",
      '',
      200,
      0,
    )
    var ult = ''
    for (const m of todas) {
      const q = String(m.get('created') || '')
      if (q > ult) ult = q
    }
    out.mais_recente_de_todas = ult.slice(11, 19)
    out.total_msgs = todas.length
    out.bug = out.mais_recente_dos_12 !== out.mais_recente_de_todas
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
