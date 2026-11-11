/// <reference path="../pb_data/types.d.ts" />
/**
 * POR QUE O wa_roteiro NÃO RESPONDE? (11/11) — piloto.
 *
 * O cron está registrado e aparece no log como "finished", mas há 87 conversas
 * em triagem e ZERO resposta da IA.
 *
 * Aqui se pega UMA conversa em triagem e se mostra por que o robô não age:
 * janela de tempo, horário, pausa, última mensagem.
 *
 * GET /backend/v1/piloto/bloqueio
 */
routerAdd(
  'GET',
  '/backend/v1/piloto/bloqueio',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, amostra: [], motivos: {} }

    var cfg = null
    try {
      const cfgs = app.findRecordsByFilter('atendimento_config', '', '', 200, 0)
      for (const c of cfgs) {
        var nomeEmp = ''
        try {
          nomeEmp = String(
            app.findRecordById('empresas', String(c.get('empresa'))).get('apelido') || '',
          )
        } catch (eE) {}
        if (nomeEmp === 'Gol 7' || nomeEmp === 'TESTE') continue
        if (!cfg || Number(c.get('versao') || 0) > Number(cfg.get('versao') || 0)) cfg = c
      }
    } catch (e0) {}

    out.config = {
      versao: cfg ? Number(cfg.get('versao') || 0) : 0,
      ligado: cfg ? cfg.get('ligado') === true : false,
      janela_min: cfg ? Number(cfg.get('janela_min') || 0) : 0,
      usar_horario: cfg ? cfg.get('usar_horario') === true : false,
      hora_inicio: cfg ? String(cfg.get('hora_inicio') || '') : '',
      hora_fim: cfg ? String(cfg.get('hora_fim') || '') : '',
    }

    // 5 conversas em triagem na central, com dados de bloqueio
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
        if (out.amostra.length >= 5) break
        var papel = ''
        try {
          papel = String(
            app.findRecordById('whatsapp_conexoes', String(c.get('conexao'))).get('papel') || '',
          )
        } catch (eP) {}
        if (papel !== 'central') continue

        const ultimaQ = new Date(
          String(c.get('ultima_mensagem_em') || c.get('created') || ''),
        ).getTime()
        const horas = ultimaQ > 0 ? Math.round((agora - ultimaQ) / 3600000) : -1

        out.amostra.push({
          tel: String(c.get('contato_telefone') || '').slice(-6),
          ultimo_autor: String(c.get('ultimo_autor') || ''),
          horas_desde_ultima: horas,
          ultima_resposta_ia: String(c.get('ultima_resposta_ia_em') || '').slice(0, 16),
          ia_bloqueada: String(c.get('ia_bloqueada') || ''),
          total_msgs: Number(c.get('total_mensagens') || 0),
        })
      }
    } catch (e2) {}

    // mensagens recebidas nas ultimas 3h (para ver se há o que responder)
    var recentes = 0
    try {
      const msgs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "direcao='entrada' && created>='2026-11-11'",
        '',
        300,
        0,
      )
      const agora = new Date().getTime()
      for (const m of msgs) {
        const q = new Date(String(m.get('created') || '')).getTime()
        if (q > 0 && agora - q < 3 * 3600000) recentes++
      }
    } catch (e3) {}
    out.msgs_entrada_3h = recentes
    out.agora_utc = new Date().toISOString().slice(11, 16)

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
