/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/rev4',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, por_sessao: {}, entregues: 0, enviados_por_sessao: {} }
    // mapeia session_id -> nome/papel
    const sMap = {}
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      '',
      '',
      60,
      0,
    )) {
      sMap[String(c.get('session_id') || '')] =
        String(c.get('nome_exibicao') || '') + '/' + String(c.get('papel') || '')
    }
    // TODOS os eventos de hoje
    const ev = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_eventos'),
      "created>='2026-11-13 00:00'",
      '',
      600,
      0,
    )
    for (const x of ev) {
      const tipo = String(x.get('evento') || '')
      if (tipo !== 'message.delivered' && tipo !== 'message.failed' && tipo !== 'message.read')
        continue
      const s = String(x.get('session_id') || '')
      const nome = sMap[s] || 'sessao:' + s.slice(0, 12)
      if (!out.por_sessao[nome]) out.por_sessao[nome] = { delivered: 0, failed: 0, read: 0 }
      if (tipo === 'message.delivered') {
        out.por_sessao[nome].delivered++
        out.entregues++
      }
      if (tipo === 'message.failed') out.por_sessao[nome].failed++
      if (tipo === 'message.read') out.por_sessao[nome].read++
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
