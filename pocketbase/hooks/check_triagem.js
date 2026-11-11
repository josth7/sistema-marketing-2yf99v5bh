/// <reference path="../pb_data/types.d.ts" />
/**
 * POR QUE O wa_roteiro NÃO RESPONDE AS CONVERSAS RECENTES? (11/11).
 *
 * O cron está registrado e aparece no log, mas 5 conversas com mensagem do
 * cliente de 1–2h atrás seguem sem resposta da IA. Aqui se reproduz a triagem
 * do cron para UMA dessas conversas e mostra onde ela para.
 *
 * GET /backend/v1/check/roteiro-triagem
 */
routerAdd(
  'GET',
  '/backend/v1/check/roteiro-triagem',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, casos: [] }

    // config ativa da Haisan
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
    }

    const agora = new Date().getTime()
    const janela = out.config.janela_min > 0 ? out.config.janela_min : 720

    try {
      const cvs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "estado='triagem'",
        '',
        3000,
        0,
      )
      for (const c of cvs) {
        if (out.casos.length >= 5) break
        var papel = ''
        try {
          papel = String(
            app.findRecordById('whatsapp_conexoes', String(c.get('conexao'))).get('papel') || '',
          )
        } catch (eP) {}
        if (papel !== 'central') continue

        const q = new Date(String(c.get('ultima_mensagem_em') || c.get('created') || '')).getTime()
        const horas = q > 0 ? (agora - q) / 3600000 : 9999
        if (horas > 24) continue

        // por que não respondeu?
        const motivos = []

        // a) a última mensagem é do cliente?
        if (String(c.get('ultimo_autor') || '') !== 'cliente') {
          motivos.push('ultima mensagem NAO e do cliente (' + String(c.get('ultimo_autor')) + ')')
        }

        // b) o robô já respondeu DEPOIS da última mensagem? (idempotência)
        const ultimaIa = String(c.get('ultima_resposta_ia_em') || '')
        if (ultimaIa !== '') {
          const qi = new Date(ultimaIa).getTime()
          if (qi > 0 && qi >= q) motivos.push('a IA respondeu depois da ultima mensagem')
        }

        // c) janela
        if (horas * 60 > janela) motivos.push('fora da janela de ' + janela + ' min')

        // d) pausa?
        const bloqueada = String(c.get('ia_bloqueada') || '')
        if (bloqueada !== '') motivos.push('IA bloqueada: ' + bloqueada)

        // e) o lead tem dono? (se transferida, o robo nao age)
        var dono = ''
        try {
          const lid = String(c.get('lead') || '')
          if (lid !== '') dono = String(app.findRecordById('crm_leads', lid).get('owner_id') || '')
        } catch (eL) {}

        out.casos.push({
          tel: String(c.get('contato_telefone') || '').slice(-6),
          horas: Math.round(horas),
          ultimo_autor: String(c.get('ultimo_autor') || ''),
          ultima_ia: ultimaIa.slice(0, 16),
          total_msgs: Number(c.get('total_mensagens') || 0),
          lead_tem_dono: dono !== '',
          motivos: motivos,
          deveria_responder: motivos.length === 0,
        })
      }
    } catch (e1) {
      out.erro = String(e1).slice(0, 150)
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
