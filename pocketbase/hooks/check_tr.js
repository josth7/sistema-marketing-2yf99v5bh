/// <reference path="../pb_data/types.d.ts" />
/**
 * AS CONVERSAS EM TRIAGEM (12/11) — o robô deveria agir nelas?
 *
 * meu diagnóstico anterior lia a config pela MAIOR versão (v12 da Gol 7) em vez
 * de pela empresa da central. Aqui se usa o MESMO critério do cron e se mostra
 * cada conversa em triagem com o motivo de o robô agir ou não.
 *
 * GET /backend/v1/check/triagem-real
 */
routerAdd(
  'GET',
  '/backend/v1/check/triagem-real',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, casos: [] }

    // central
    var central = null
    try {
      const cs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true && fixture=false",
        '',
        1,
        0,
      )
      if (cs.length > 0) central = cs[0]
    } catch (e0) {}
    if (!central) return e.json(200, { ok: false, erro: 'sem central' })

    // a config DA EMPRESA DA CENTRAL (mesmo critério do cron)
    const empCentral = String(central.get('empresa') || '')
    var cfg = null
    try {
      const vs = app.findRecordsByFilter(
        'atendimento_config',
        empCentral !== '' ? "empresa='" + empCentral + "'" : '',
        '',
        200,
        0,
      )
      var maior = -1
      for (const v of vs) {
        const n = Number(v.get('versao') || 0)
        if (n > maior) {
          maior = n
          cfg = v
        }
      }
    } catch (e1) {}

    out.config_da_central = {
      empresa: empCentral.slice(0, 8),
      versao: cfg ? Number(cfg.get('versao') || 0) : 0,
      ligado: cfg ? cfg.get('ligado') === true : false,
      janela_min: cfg ? Number(cfg.get('janela_min') || 0) : 0,
    }

    // conversas da central em triagem
    var cvs = []
    try {
      cvs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "conexao='" + central.id + "' && estado='triagem'",
        '',
        500,
        0,
      )
    } catch (e2) {}
    out.triagem_total = cvs.length

    const agora = new Date().getTime()
    const janela = out.config_da_central.janela_min || 720

    for (const c of cvs) {
      if (out.casos.length >= 8) break
      const q = new Date(String(c.get('ultima_mensagem_em') || c.get('created') || '')).getTime()
      const horas = q > 0 ? (agora - q) / 3600000 : 9999
      const motivos = []

      if (String(c.get('ultimo_autor') || '') !== 'cliente')
        motivos.push('ultima msg nao e do cliente')
      const ultimaIa = String(c.get('ultima_resposta_ia_em') || '')
      if (ultimaIa !== '') {
        const qi = new Date(ultimaIa).getTime()
        if (qi > 0 && qi >= q) motivos.push('IA ja respondeu depois')
      }
      if (horas * 60 > janela) motivos.push('fora da janela de ' + janela + 'min')

      out.casos.push({
        tel: String(c.get('contato_telefone') || '').slice(-6),
        horas: Math.round(horas),
        ultimo_autor: String(c.get('ultimo_autor') || ''),
        ultima_ia: ultimaIa.slice(0, 16),
        msgs: Number(c.get('total_mensagens') || 0),
        motivos: motivos,
        deveria_agir: motivos.length === 0,
      })
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
