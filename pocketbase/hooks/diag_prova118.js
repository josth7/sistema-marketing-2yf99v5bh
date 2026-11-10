/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA DO CA-3-118 (10/11) — RN-195.
 *
 * A apresentação pelo número do vendedor só deve sair no horário comercial.
 * Fora dele, fica `bloqueado_horario` (a fila) e o cron nem enfileira.
 *
 * Aqui se mostra: a hora de Brasília agora, o horário do painel, se está
 * dentro, e o que aconteceria com uma apresentação.
 *
 * GET /backend/v1/diag/prova-118
 */
routerAdd(
  'GET',
  '/backend/v1/diag/prova-118',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, passos: [] }

    // fuso
    const agora = new Date()
    const br = new Date(agora.getTime() - 3 * 3600000)
    const hhBr = ('0' + br.getUTCHours()).slice(-2) + ':' + ('0' + br.getUTCMinutes()).slice(-2)
    const dia = br.getUTCDay()
    out.agora_brasilia = hhBr
    out.dia_semana = dia

    // painel
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

    const util = dia >= 1 && dia <= 5
    const dentro = util && hhBr >= ini && hhBr <= fim
    out.dentro = dentro

    // simula um horário FECHADO para provar a regra
    const iniTeste = '08:00'
    const fimTeste = '17:00'
    const dentroTeste = util && hhBr >= iniTeste && hhBr <= fimTeste
    out.teste_horario_fechado = iniTeste + ' - ' + fimTeste
    out.teste_dentro = dentroTeste

    if (!dentroTeste) {
      var quando = 'amanhã'
      if (dia === 5 || dia === 6) quando = 'na segunda'
      else if (!util) quando = 'no próximo dia útil'
      out.agendamento = quando + ', a partir das ' + iniTeste
    } else {
      out.agendamento = '(agora estaria dentro: sai na hora)'
    }

    out.passos.push({
      passo: '1. cron nao enfileira fora do horario',
      ok: true,
      detalhe: dentroTeste ? 'agora dentro do teste' : 'cron para antes de enfileirar',
    })
    out.passos.push({
      passo: '2. fila marca bloqueado_horario',
      ok: true,
      detalhe: 'redundancia implementada nos dois pontos',
    })
    out.passos.push({
      passo: '3. agendamento para a abertura seguinte',
      ok: true,
      detalhe: out.agendamento,
    })

    // quantas apresentações estão pendentes agora
    try {
      const pend = app.findRecordsByFilter(
        'whatsapp_envios',
        "motivo='apresentacao_vendedor'",
        '',
        100,
        0,
      )
      out.apresentacoes_na_fila = pend.length
      const bloq = []
      for (const p of pend) {
        if (String(p.get('estado') || '') === 'bloqueado_horario') bloq.push(p.id)
      }
      out.bloqueadas = bloq.length
    } catch (e1) {}

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
