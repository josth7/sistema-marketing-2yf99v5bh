/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/rev5',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true }
    // o envio que falhou as 11:00 de hoje (o unico)
    const fal = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_eventos'),
      "evento='message.failed' && created>='2026-11-13 00:00'",
      '',
      5,
      0,
    )
    if (fal.length > 0) {
      const x = fal[0]
      const s = String(x.get('session_id') || '')
      out.falha = {
        q: String(x.get('created') || '').slice(0, 19),
        sessao: s.slice(0, 24),
        ref: String(x.get('ref_id') || '').slice(-16),
      }
      // qual conexao tem essa sessao
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        '',
        '',
        60,
        0,
      ))
        if (String(c.get('session_id') || '') === s)
          out.falha.conexao = String(c.get('nome_exibicao') || '')
      // qual envio tinha esse wamid
      const en = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        "wa_message_id~'" + String(x.get('ref_id') || '').slice(-16) + "'",
        '',
        3,
        0,
      )
      if (en.length > 0)
        out.falha.envio = {
          motivo: String(en[0].get('motivo') || ''),
          dest: String(en[0].get('destino_telefone') || '').slice(-6),
          q: String(en[0].get('created') || '').slice(11, 19),
        }
    }
    // quantas APRESENTACOES entregaram (evento delivered) - as de hoje e ontem
    var apOk = 0,
      apFail = 0
    const ap = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "motivo='apresentacao_vendedor' && created>='2026-11-12 18:00'",
      '',
      100,
      0,
    )
    for (const en of ap) {
      const wid = String(en.get('wa_message_id') || '')
      if (wid === '') {
        apFail++
        continue
      }
      var achou = false
      try {
        const ev = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_eventos'),
          "ref_id='" + wid + "'",
          '',
          5,
          0,
        )
        for (const y of ev) {
          if (String(y.get('evento')) === 'message.delivered') achou = true
        }
      } catch (e1) {}
      if (achou) apOk++
    }
    out.apresentacoes = { delivered: apOk, sem_wamid_ou_falha: apFail, total: ap.length }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
