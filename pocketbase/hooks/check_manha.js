/// <reference path="../pb_data/types.d.ts" />
/**
 * ESTADO DO PILOTO — manhã de 12/11.
 *
 * Consolidado para o dono: o robô está respondendo? a saudação do vendedor
 * saiu? quantas conversas esperando?
 *
 * GET /backend/v1/check/manha
 */
routerAdd(
  'GET',
  '/backend/v1/check/manha',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, agora_utc: new Date().toISOString().slice(0, 16) }

    // 1. respostas da IA nas últimas 24h
    var nIa = 0
    var ultimas = []
    try {
      const msgs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "autor='ia' && created>='2026-11-11 20:00'",
        '',
        200,
        0,
      )
      nIa = msgs.length
      var lst = []
      for (const m of msgs) {
        lst.push({
          q: String(m.get('created') || '').slice(11, 19),
          t: String(m.get('texto') || '').slice(0, 40),
        })
      }
      lst.sort(function (a, b) {
        return a.q < b.q ? 1 : -1
      })
      ultimas = lst.slice(0, 5)
    } catch (e1) {}
    out.msgs_ia = nIa
    out.ultimas_ia = ultimas

    // 2. apresentações (saudação do vendedor) — alguma passou?
    var apres = { enviado: 0, erro: 0, erro_definitivo: 0, pendente: 0 }
    try {
      const envs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        "motivo='apresentacao_vendedor' && created>='2026-11-11 20:00'",
        '',
        100,
        0,
      )
      for (const en of envs) {
        const est = String(en.get('estado') || '')
        if (apres[est] !== undefined) apres[est]++
        else apres[est] = (apres[est] || 0) + 1
      }
    } catch (e2) {}
    out.apresentacoes_24h = apres

    // 3. conversas em triagem na central com mensagem recente
    var recentes = 0
    var antigas = 0
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
        if (horas <= 24) recentes++
        else antigas++
      }
    } catch (e3) {}
    out.triagem_recente_24h = recentes
    out.triagem_antiga = antigas

    // 4. fila de envios
    try {
      const p = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        "estado='pendente'",
        '',
        200,
        0,
      )
      out.fila_pendente = p.length
    } catch (e4) {}

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
