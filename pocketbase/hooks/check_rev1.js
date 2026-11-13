/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/rev1',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, agora: new Date().toISOString().slice(0, 19) }
    // TODOS os eventos de hoje, contados (a verdade crua)
    const ev = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_eventos'),
      "created>='2026-11-13 00:00'",
      '',
      500,
      0,
    )
    const porEv = {}
    for (const x of ev) {
      const k = String(x.get('evento') || '')
      porEv[k] = (porEv[k] || 0) + 1
    }
    out.eventos_hoje = porEv
    // todos os message.failed de hoje com o codigo
    const fal = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_eventos'),
      "evento='message.failed' && created>='2026-11-13 00:00'",
      '',
      300,
      0,
    )
    const porCod = {}
    var t130497 = 0,
      t131047 = 0,
      outro = 0
    for (const x of fal) {
      const c = String(x.get('codigo_erro') || '')
      if (c.indexOf('130497') >= 0) t130497++
      else if (c.indexOf('131047') >= 0) t131047++
      else outro++
    }
    out.failed_hoje = { total: fal.length, com_130497: t130497, com_131047: t131047, outros: outro }
    // todas as apresentacoes de hoje
    const ap = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "motivo='apresentacao_vendedor' && created>='2026-11-13 00:00'",
      '',
      100,
      0,
    )
    out.apres_hoje = []
    for (const x of ap)
      out.apres_hoje.push({
        q: String(x.get('created') || '').slice(11, 16),
        dest: String(x.get('destino_telefone') || '').slice(-6),
        est: String(x.get('estado') || ''),
        erro: String(x.get('ultimo_erro') || '').slice(0, 40),
        wamid: String(x.get('wa_message_id') || '') !== '',
      })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
