/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/d14',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, agora: new Date().toISOString().slice(0, 19) }
    // 1. os crons e quando rodaram
    out.crons = []
    try {
      for (const c of app.findRecordsByFilter('_cron_settings', '', '', 100, 0)) {
        const j = String(c.get('job') || '')
        if (j.indexOf('roteiro') >= 0 || j.indexOf('envios_fila') >= 0)
          out.crons.push({ job: j, disabled: String(c.get('disabled') || '') })
      }
    } catch (e1) {}
    // 2. a JANELA: quantas horas desde a ultima msg desse numero
    const ms = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "contato_telefone~'9036170' && direcao='entrada'",
      '',
      100,
      0,
    )
    var ult = ''
    for (const m of ms) {
      const q = String(m.get('created') || '')
      if (q > ult) ult = q
    }
    out.ultima_entrada = ult.slice(0, 19)
    // 3. fila pendente?
    try {
      const p = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        "estado='pendente'",
        '',
        100,
        0,
      )
      out.fila_pendente = p.length
    } catch (e2) {}
    // 4. essa conversa esta sendo vista? tem algo que exclui? (fixture, empresa)
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
    out.conv = []
    for (const c of cvs)
      if (centrais[String(c.get('conexao') || '')])
        out.conv.push({
          estado: String(c.get('estado') || ''),
          etapa: String(c.get('etapa_atual') || ''),
          fixture: String(c.get('fixture')),
          empresa: String(c.get('empresa') || '').slice(0, 10),
          total: Number(c.get('total_mensagens') || 0),
        })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
