/// <reference path="../pb_data/types.d.ts" />
/**
 * O ROBÔ PAROU DE NOVO? — manhã de 12/11.
 *
 * 0 mensagens da IA desde ontem 20h UTC e 6 apresentações em erro_definitivo.
 * Aqui se verifica: cron registrado, mensagens entrantes sem resposta, e o
 * erro real das apresentações.
 *
 * GET /backend/v1/check/parou
 */
routerAdd(
  'GET',
  '/backend/v1/check/parou',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true }

    // 1. crons do robô
    out.crons = []
    try {
      for (const c of app.findRecordsByFilter('_cron_settings', '', '', 100, 0)) {
        const j = String(c.get('job') || '')
        if (j.indexOf('wa_') >= 0 || j.indexOf('whatsapp') >= 0)
          out.crons.push({ job: j, disabled: String(c.get('disabled') || '') })
      }
    } catch (e0) {}

    // 2. mensagens de cliente SEM resposta da IA depois
    var semResposta = []
    try {
      const msgs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "direcao='entrada' && created>='2026-11-11 20:00'",
        '',
        300,
        0,
      )
      out.msgs_entrada = msgs.length
      for (const m of msgs) {
        if (semResposta.length >= 5) break
        const cx = String(m.get('conexao') || '')
        const tel = String(m.get('contato_telefone') || '')
        const q = String(m.get('created') || '')
        // houve resposta da IA depois?
        var respondeu = false
        try {
          const saidas = app.findRecordsByFilter(
            app.findCollectionByNameOrId('whatsapp_mensagens'),
            "conexao='" + cx + "' && contato_telefone='" + tel + "' && autor='ia'",
            '',
            20,
            0,
          )
          for (const s of saidas) {
            if (String(s.get('created') || '') > q) respondeu = true
          }
        } catch (e1) {}
        if (!respondeu) {
          var papel = ''
          var estado = ''
          try {
            papel = String(app.findRecordById('whatsapp_conexoes', cx).get('papel') || '')
            const cvs = app.findRecordsByFilter(
              app.findCollectionByNameOrId('whatsapp_conversas'),
              "conexao='" + cx + "' && contato_telefone='" + tel + "'",
              '',
              1,
              0,
            )
            if (cvs.length > 0) estado = String(cvs[0].get('estado') || '')
          } catch (e2) {}
          semResposta.push({
            tel: tel.slice(-6),
            quando: q.slice(11, 19),
            papel: papel,
            estado: estado,
            texto: String(m.get('texto') || '').slice(0, 35),
          })
        }
      }
    } catch (e3) {}
    out.sem_resposta_ia = semResposta

    // 3. erro das apresentações
    var erros = []
    try {
      const envs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        "motivo='apresentacao_vendedor' && estado='erro_definitivo'",
        '',
        10,
        0,
      )
      for (const en of envs) {
        erros.push({
          quando: String(en.get('created') || '').slice(0, 16),
          erro: String(en.get('ultimo_erro') || '').slice(0, 60),
          dest: String(en.get('destino_telefone') || '').slice(-6),
        })
      }
    } catch (e4) {}
    out.erros_apresentacao = erros

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
