/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/ev-sent',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true }
    // eventos de hoje por tipo
    const ev = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_eventos'),
      "created>='2026-11-13 00:00'",
      '',
      600,
      0,
    )
    const porEv = {}
    for (const x of ev) {
      const k = String(x.get('evento') || '')
      porEv[k] = (porEv[k] || 0) + 1
    }
    out.eventos_hoje = porEv
    out.recebe_messages_sent = (porEv['messages.sent'] || 0) > 0
    // e as ultimas mensagens de saida gravadas no historico
    const saidas = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "direcao='saida' && created>='2026-11-13 00:00'",
      '',
      100,
      0,
    )
    out.saidas_hoje = saidas.length
    const amostra = []
    for (const s of saidas)
      amostra.push(
        String(s.get('created') || '').slice(11, 19) +
          ' ' +
          String(s.get('autor') || '') +
          ' ' +
          String(s.get('texto') || '').slice(0, 30),
      )
    amostra.sort()
    out.amostra_saidas = amostra.slice(-4)
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
