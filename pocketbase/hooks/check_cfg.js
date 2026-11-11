/// <reference path="../pb_data/types.d.ts" />
/**
 * O QUE O CRON LÊ AGORA? (11/11).
 *
 * Reproduz a leitura da config do `wa_roteiro_cron`: empresa da central →
 * config dessa empresa → ligado/janela. Se `ligado=false`, o cron sai.
 *
 * GET /backend/v1/check/cfg-cron
 */
routerAdd(
  'GET',
  '/backend/v1/check/cfg-cron',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true }

    // conexão central
    var central = null
    try {
      const cs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true",
        '',
        5,
        0,
      )
      if (cs.length > 0) central = cs[0]
    } catch (e0) {}
    if (!central) return e.json(200, { ok: false, erro: 'sem central' })

    const empCentral = String(central.get('empresa') || '')
    out.central = {
      nome: String(central.get('nome_exibicao') || ''),
      empresa: empCentral.slice(0, 12),
    }

    // a config que o cron pegaria
    var cfg = null
    var empresaCfg = ''
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
      if (!cfg) {
        const vs2 = app.findRecordsByFilter('atendimento_config', '', '', 200, 0)
        for (const v of vs2) {
          const n = Number(v.get('versao') || 0)
          if (n > maior) {
            maior = n
            cfg = v
          }
        }
      }
    } catch (e1) {}

    if (cfg) {
      empresaCfg = String(cfg.get('empresa') || '')
      var nomeEmp = ''
      try {
        nomeEmp = String(app.findRecordById('empresas', empresaCfg).get('apelido') || '')
      } catch (e2) {}
      out.config_lida = {
        versao: Number(cfg.get('versao') || 0),
        empresa: nomeEmp || empresaCfg.slice(0, 10),
        ligado: cfg.get('ligado') === true,
        usar_horario: cfg.get('usar_horario') === true,
        hora_inicio: String(cfg.get('hora_inicio') || ''),
        hora_fim: String(cfg.get('hora_fim') || ''),
        janela_min: Number(cfg.get('janela_min') || 0),
      }
      out.cron_vai_responder = cfg.get('ligado') === true
    } else {
      out.erro = 'nenhuma config encontrada'
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
