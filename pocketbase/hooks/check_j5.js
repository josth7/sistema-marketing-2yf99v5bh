/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/j5',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true }
    // a IA respondeu nas ultimas horas? (prova de que o robo vive)
    const ia = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "autor='ia' && created>='2026-11-12 18:00'",
      '',
      100,
      0,
    )
    out.ia_respostas_apos_15h = ia.length
    const lst = []
    for (const m of ia)
      lst.push(
        String(m.get('created') || '').slice(11, 19) +
          ' -> ' +
          String(m.get('contato_telefone') || '').slice(-6) +
          ' : ' +
          String(m.get('texto') || '').slice(0, 35),
      )
    lst.sort()
    out.exemplos = lst.slice(-5)
    // a conversa da central com a Sabrina: estado agora
    const cv = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conversas'),
      "contato_telefone~'9036170'",
      '',
      5,
      0,
    )
    const papel = {}
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      '',
      '',
      60,
      0,
    ))
      papel[c.id] = String(c.get('papel') || '')
    out.sabrina = []
    for (const c of cv)
      out.sabrina.push({
        papel: papel[String(c.get('conexao') || '')] || '?',
        estado: String(c.get('estado') || ''),
        ult: String(c.get('ultima_mensagem_em') || '').slice(0, 19),
        msgs: Number(c.get('total_mensagens') || 0),
      })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
