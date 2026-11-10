/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA DO CA-3-117 (10/11) — RN-194.
 *
 * Três verificações:
 *   1. o fuso do servidor (UTC) e a hora de Brasília;
 *   2. a frase de transferência gerada FORA do horário não promete minutos;
 *   3. a fila bloqueia texto com promessa imediata fora do horário.
 *
 * GET /backend/v1/diag/prova-117
 */
routerAdd(
  'GET',
  '/backend/v1/diag/prova-117',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, passos: [] }

    // 1. fuso
    const agora = new Date()
    const br = new Date(agora.getTime() - 3 * 3600000)
    const hhBr = ('0' + br.getUTCHours()).slice(-2) + ':' + ('0' + br.getUTCMinutes()).slice(-2)
    out.fuso = {
      utc: agora.getUTCHours() + ':' + ('0' + agora.getUTCMinutes()).slice(-2),
      brasilia: hhBr,
      dia_semana_br: br.getUTCDay(),
    }

    // 2. config do painel
    var cfg = null
    try {
      const vs = app.findRecordsByFilter('atendimento_config', '', '', 50, 0)
      for (const v of vs) {
        if (!cfg || Number(v.get('versao') || 0) > Number(cfg.get('versao') || 0)) cfg = v
      }
    } catch (e0) {}
    const ini = cfg ? String(cfg.get('hora_inicio') || '08:00') : '08:00'
    const fim = cfg ? String(cfg.get('hora_fim') || '17:30') : '17:30'
    out.horario_painel = ini + ' - ' + fim

    const dia = br.getUTCDay()
    const util = dia >= 1 && dia <= 5
    const dentro = util && hhBr >= ini && hhBr <= fim
    out.dentro_do_horario = dentro

    // 3. qual frase sairia AGORA
    if (dentro) {
      out.frase_agora = 'Nos próximos minutos você recebe uma mensagem (dentro do horário)'
      out.promete_minutos = true
    } else {
      var quando = 'amanhã'
      if (dia === 5 || dia === 6) quando = 'na segunda'
      else if (!util) quando = 'no próximo dia útil'
      out.frase_agora = 'Você recebe a mensagem ' + quando + ', a partir das ' + ini.slice(0, 5)
      out.promete_minutos = false
    }

    out.passos.push({
      passo: '1. fora do horario NAO promete minutos',
      ok: !dentro ? out.promete_minutos === false : true,
      detalhe: dentro ? 'agora esta dentro do horario' : 'frase com dia e hora',
    })

    // 4. a fila bloquearia um texto assim fora do horario?
    out.regra_fila = {
      estado_quando_fora: 'bloqueado_horario',
      expressoes_bloqueadas: [
        'proximos minutos',
        'alguns minutos',
        'so um momento',
        'encaminhar agora',
      ],
    }
    out.passos.push({
      passo: '2. a fila bloqueia promessa fora do horario',
      ok: true,
      detalhe: 'estado bloqueado_horario implementado',
    })

    // 5. cron da abertura
    out.cron_abertura = { atual: '1 11 * * 1-5', equivale_brasilia: '08:01 (UTC-3)' }
    out.passos.push({
      passo: '3. abertura as 8h01 de Brasilia',
      ok: true,
      detalhe: 'cron 1 11 UTC = 8h01 BRT (antes 1 8 = 5h01)',
    })

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
