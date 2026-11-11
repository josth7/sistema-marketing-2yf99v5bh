/// <reference path="../pb_data/types.d.ts" />
/**
 * O ROBÔ ESTÁ FUNCIONANDO AGORA? (11/11) — piloto.
 *
 * O teste das 11:43 foi transferido sem o robô falar. Duas hipóteses:
 *   1. a distribuição transferiu antes de o robô agir (corrida);
 *   2. o cron do robô não está rodando.
 *
 * Aqui se testa a decisão do roteiro DIRETO e se vê se o cron está agindo nas
 * conversas em triagem.
 *
 * GET /backend/v1/piloto/robo-vivo
 */
routerAdd(
  'GET',
  '/backend/v1/piloto/robo-vivo',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true }

    // 1. quantas conversas em triagem na central e quando foi a última resposta da IA
    var triagem = []
    var ultimaIa = ''
    try {
      const cvs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "estado='triagem'",
        '',
        3000,
        0,
      )
      for (const c of cvs) {
        var papel = ''
        try {
          papel = String(
            app.findRecordById('whatsapp_conexoes', String(c.get('conexao'))).get('papel') || '',
          )
        } catch (eP) {}
        if (papel !== 'central') continue
        triagem.push(String(c.get('contato_telefone') || '').slice(-6))
        const q = String(c.get('ultima_resposta_ia_em') || '')
        if (q > ultimaIa) ultimaIa = q
      }
    } catch (e1) {}
    out.triagem_central = triagem.length
    out.exemplos = triagem.slice(0, 5)
    out.ultima_resposta_ia = ultimaIa.slice(0, 19)

    // 2. mensagens da IA nas últimas 24h
    var nIa = 0
    var ultimas = []
    try {
      const msgs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "autor='ia'",
        '',
        200,
        0,
      )
      const agora = new Date().getTime()
      for (const m of msgs) {
        const q = new Date(String(m.get('created') || '')).getTime()
        if (!(q > 0) || agora - q > 24 * 3600000) continue
        nIa++
        if (ultimas.length < 5) {
          ultimas.push({
            quando: String(m.get('created') || '').slice(11, 19),
            texto: String(m.get('texto') || '').slice(0, 50),
          })
        }
      }
    } catch (e2) {}
    out.msgs_ia_24h = nIa
    out.ultimas_ia = ultimas

    // 3. o cron wa_roteiro está registrado?
    try {
      const cs = app.findRecordsByFilter('_cron_settings', '', '', 100, 0)
      out.crons = []
      for (const c of cs) {
        const j = String(c.get('job') || '')
        if (j.indexOf('roteiro') >= 0 || j.indexOf('distribu') >= 0)
          out.crons.push({ job: j, disabled: String(c.get('disabled') || '') })
      }
    } catch (e3) {}

    // 4. o roteiro SIMULADO agora
    out.agora_utc = new Date().toISOString().slice(11, 16)

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
