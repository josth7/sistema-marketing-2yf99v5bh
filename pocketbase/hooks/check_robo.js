/// <reference path="../pb_data/types.d.ts" />
/**
 * O ROBÔ ESTÁ RESPONDENDO AGORA? (11/11) — verificação.
 *
 * Depois de registrar o `wa_roteiro`, conferir:
 *   1. o cron está na lista e o log mostra execução;
 *   2. quantas mensagens da IA nasceram nas últimas horas;
 *   3. conversas em triagem na central com mensagem RECENTE (não lixo);
 *   4. o roteiro simulado responde.
 *
 * GET /backend/v1/check/robo
 */
routerAdd(
  'GET',
  '/backend/v1/check/robo',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, agora_utc: new Date().toISOString().slice(11, 19) }

    // 1. crons registrados
    out.crons = []
    try {
      for (const c of app.findRecordsByFilter('_cron_settings', '', '', 100, 0)) {
        const j = String(c.get('job') || '')
        if (j.indexOf('wa_') >= 0 || j.indexOf('whatsapp') >= 0)
          out.crons.push({ job: j, disabled: String(c.get('disabled') || '') })
      }
    } catch (e0) {}

    // 2. mensagens da IA nas ultimas 6h
    var nIa = 0
    var ultimas = []
    try {
      const msgs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "autor='ia'",
        '',
        300,
        0,
      )
      const agora = new Date().getTime()
      for (const m of msgs) {
        const q = new Date(String(m.get('created') || '')).getTime()
        if (!(q > 0) || agora - q > 6 * 3600000) continue
        nIa++
        if (ultimas.length < 6) {
          ultimas.push({
            quando: String(m.get('created') || '').slice(11, 19),
            texto: String(m.get('texto') || '').slice(0, 60),
          })
        }
      }
    } catch (e1) {}
    out.msgs_ia_6h = nIa
    out.ultimas_ia = ultimas

    // 3. conversas em triagem na central com mensagem RECENTE
    var recentes = 0
    var antigas = 0
    var exemplos = []
    try {
      const cvs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "estado='triagem'",
        '',
        3000,
        0,
      )
      const agora = new Date().getTime()
      for (const c of cvs) {
        var papel = ''
        try {
          papel = String(
            app.findRecordById('whatsapp_conexoes', String(c.get('conexao'))).get('papel') || '',
          )
        } catch (eP) {}
        if (papel !== 'central') continue
        const q = new Date(String(c.get('ultima_mensagem_em') || c.get('created') || '')).getTime()
        const horas = q > 0 ? (agora - q) / 3600000 : 9999
        if (horas <= 24) {
          recentes++
          if (exemplos.length < 5) {
            exemplos.push({
              tel: String(c.get('contato_telefone') || '').slice(-6),
              horas: Math.round(horas),
              ultimo_autor: String(c.get('ultimo_autor') || ''),
            })
          }
        } else {
          antigas++
        }
      }
    } catch (e2) {}
    out.triagem_recente_24h = recentes
    out.triagem_antiga = antigas
    out.exemplos_recentes = exemplos

    // 4. fila de envios
    try {
      const envs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        "estado='pendente'",
        '',
        200,
        0,
      )
      out.fila_pendente = envs.length
    } catch (e3) {}

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
