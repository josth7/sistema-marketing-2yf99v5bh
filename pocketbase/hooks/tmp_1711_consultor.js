/// <reference path="../pb_data/types.d.ts" />
/**
 * TEMPORÁRIO (17/11, consultor Adapta) — apagar depois de rodar.
 *
 * Pedido do consultor: Adriana e Fábio (números bloqueados pela Meta para
 * iniciar conversa, erro 130497) passam a receber o aviso PELA CENTRAL, com o
 * contexto do cliente e o link — regra nova em whatsapp_transferencias.js, que
 * vale para vendedor com `apresentacao_ativa=false`.
 *   1. desliga `apresentacao_ativa` nas conexões da Adriana e do Fábio;
 *   2. confere se os números deles estão em whatsapp_numeros_internos;
 *   3. confere se cada um falou com a central nas últimas 24h (janela aberta).
 * Roda UMA vez entre 21:00 e 21:20 UTC. Nenhum telefone completo no log.
 */
cronAdd('tmp_1711_consultor', '* * * * *', () => {
  const agora = new Date().getTime()
  const ini = new Date('2026-11-17T21:00:00Z').getTime()
  const fim = new Date('2026-11-17T21:20:00Z').getTime()
  if (agora < ini || agora > fim) return
  try {
    if ($app.store().get('tmp1711_v11') === true) return
    $app.store().set('tmp1711_v11', true)
  } catch (eSt) {
    if (new Date().getUTCMinutes() % 10 !== 0) return
  }
  const P = 'tmp1711k: '
  function dig(v) {
    return String(v || '').replace(/\D/g, '')
  }

  var central = null
  try {
    const cs = $app.findRecordsByFilter(
      'whatsapp_conexoes',
      "papel='central' && ativo=true && fixture=false",
      '',
      1,
      0,
    )
    if (cs.length > 0) central = cs[0]
  } catch (eC) {}
  console.log(
    P +
      'central modelo_aviso_vendedor=' +
      (central ? String(central.get('modelo_aviso_vendedor') || '(vazio)') : '?'),
  )

  var internos = []
  try {
    internos = $app.findRecordsByFilter('whatsapp_numeros_internos', '', '', 200, 0)
  } catch (eI) {
    console.log(P + 'nao li numeros internos: ' + String(eI).slice(0, 100))
  }

  for (const email of ['adriana@haisan.com.br', 'fabio@haisan.com.br']) {
    var u = null
    try {
      const us = $app.findRecordsByFilter('users', "email='" + email + "'", '', 1, 0)
      if (us.length > 0) u = us[0]
    } catch (eU) {}
    if (!u) {
      console.log(P + email + ' nao encontrado')
      continue
    }
    var cx = null
    try {
      const xs = $app.findRecordsByFilter(
        'whatsapp_conexoes',
        "vendedor_user='" + u.id + "' && papel='vendedor' && ativo=true && fixture=false",
        '',
        1,
        0,
      )
      if (xs.length > 0) cx = xs[0]
    } catch (eX) {}
    if (!cx) {
      console.log(P + email + ' sem conexao ativa')
      continue
    }
    const antes = cx.get('apresentacao_ativa')
    try {
      cx.set('apresentacao_ativa', false)
      $app.save(cx)
      console.log(
        P +
          String(cx.get('nome_exibicao') || email) +
          ' | apresentacao_ativa ' +
          antes +
          ' -> false',
      )
    } catch (eS) {
      console.log(P + 'FALHOU desligar apresentacao de ' + email + ': ' + String(eS).slice(0, 120))
    }

    const d = dig(cx.get('numero'))
    const fim8 = d.slice(-8)
    var ehInterno = false
    for (const r of internos) {
      const s = JSON.stringify(r)
      if (fim8 !== '' && dig(s).indexOf(fim8) >= 0) ehInterno = true
    }
    var janela = 'fechada'
    if (central && fim8 !== '') {
      try {
        const desde = new Date(agora - 24 * 3600000).toISOString().replace('T', ' ').slice(0, 19)
        const ms = $app.findRecordsByFilter(
          'whatsapp_mensagens',
          "conexao='" +
            central.id +
            "' && direcao='entrada' && contato_telefone~'" +
            fim8 +
            "' && created>='" +
            desde +
            "'",
          '',
          1,
          0,
        )
        if (ms.length > 0) janela = 'aberta (falou com a central em 24h)'
      } catch (eJ) {
        janela = 'nao consegui conferir'
      }
    }
    console.log(
      P +
        String(cx.get('nome_exibicao') || email) +
        ' | numero ***' +
        d.slice(-4) +
        ' | interno=' +
        ehInterno +
        ' | janela com a central=' +
        janela,
    )
  }
})
