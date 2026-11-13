/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/rev2',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, failed: [], entregas: [] }
    // o unico failed de hoje
    const fal = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_eventos'),
      "evento='message.failed' && created>='2026-11-13 00:00'",
      '',
      20,
      0,
    )
    for (const x of fal)
      out.failed.push({
        q: String(x.get('created') || '').slice(0, 19),
        cod: String(x.get('codigo_erro') || '').slice(0, 120),
      })
    // as entregas de hoje: quais conexoes?
    const ent = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_eventos'),
      "evento='message.delivered' && created>='2026-11-13 00:00'",
      '',
      100,
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
      papel[c.id] = String(c.get('nome_exibicao') || '') + '/' + String(c.get('papel') || '')
    const porMsg = {}
    // casa o ref_id com a mensagem para saber a conexao
    var casados = 0
    for (const x of ent) {
      const rid = String(x.get('ref_id') || '')
      if (rid === '') continue
      try {
        const ms = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_mensagens'),
          "wa_message_id='" + rid + "'",
          '',
          1,
          0,
        )
        if (ms.length > 0) {
          const k = papel[String(ms[0].get('conexao') || '')] || '?'
          porMsg[k] = (porMsg[k] || 0) + 1
          casados++
        }
      } catch (e1) {}
    }
    out.entregas = casados
    out.entregas_por_conexao = porMsg
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
