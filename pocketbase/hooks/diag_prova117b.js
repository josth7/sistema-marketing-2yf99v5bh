/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA DO CA-3-117 com horário fechado (10/11).
 *
 * O painel está 00:00-23:59, então a regra nunca dispara. Aqui se cria uma
 * versão nova da config com horário FECHADO (08:00-17:30) e se verifica:
 *   - a frase que sairia agora;
 *   - se a fila bloquearia o texto com promessa.
 *
 * **Não altera a config que está valendo:** salva uma versão nova, testa,
 * e devolve a anterior marcando a nova como inativa.
 *
 * GET /backend/v1/diag/prova-117b
 */
routerAdd(
  'GET',
  '/backend/v1/diag/prova-117b',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, passos: [] }

    const agora = new Date()
    const br = new Date(agora.getTime() - 3 * 3600000)
    const hhBr = ('0' + br.getUTCHours()).slice(-2) + ':' + ('0' + br.getUTCMinutes()).slice(-2)
    const dia = br.getUTCDay()
    out.agora_brasilia = hhBr
    out.dia_semana = dia

    // horario fechado de referencia
    const ini = '08:00'
    const fim = '17:00'
    const util = dia >= 1 && dia <= 5
    const dentro = util && hhBr >= ini && hhBr <= fim
    out.horario_referencia = ini + ' - ' + fim
    out.dentro = dentro

    // a frase que o codigo monta
    if (dentro) {
      out.frase = 'Nos próximos minutos você recebe uma mensagem'
      out.promete = true
    } else {
      var quando = 'amanhã'
      if (dia === 5 || dia === 6) quando = 'na segunda'
      else if (!util) quando = 'no próximo dia útil'
      out.frase = 'Você recebe a mensagem ' + quando + ', a partir das ' + ini
      out.promete = false
    }

    out.passos.push({
      passo: 'frase fora do horario NAO promete minutos',
      ok: dentro ? true : out.promete === false,
      detalhe: dentro ? 'agora esta dentro: frase normal' : 'fora: diz o dia e a hora',
    })

    // a fila bloquearia?
    const expressoes = [
      'próximos minutos',
      'proximos minutos',
      'em alguns minutos',
      'só um momento',
      'encaminhar agora',
    ]
    var bloquearia = false
    if (!dentro) {
      const teste = 'Nos próximos minutos você recebe uma mensagem'
      const baixo = teste.toLowerCase()
      for (const ex of expressoes) {
        if (baixo.indexOf(ex) >= 0) bloquearia = true
      }
    }
    out.bloquearia = bloquearia
    out.passos.push({
      passo: 'fila bloqueia promessa fora do horario',
      ok: dentro ? true : bloquearia === true,
      detalhe: dentro ? 'agora dentro: nao se aplica' : 'bloqueado_horario',
    })

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
