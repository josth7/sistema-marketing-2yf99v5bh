/// <reference path="../pb_data/types.d.ts" />
/**
 * TEMPORÁRIO (18/11) — só leitura: os vendedores mandaram "bom dia" para a
 * central? Loga, por vendedor, as últimas mensagens que tenham o telefone dele
 * (em qualquer conexão), com conexão, direção e hora. Sem telefone no log.
 * APAGAR depois.
 */
cronAdd('tmp_1811_bomdia', '* * * * *', () => {
  if ($app.store().get('tmp_1811_bomdia_feito')) return
  $app.store().set('tmp_1811_bomdia_feito', true)
  try {
    var central = ''
    const cs = $app.findRecordsByFilter(
      'whatsapp_conexoes',
      "papel='central' && ativo=true && fixture=false",
      '',
      5,
      0,
    )
    if (cs.length > 0) central = cs[0].id
    console.log(
      'tmp_1811_bomdia: central=' + central + ' (total centrais reais ativas=' + cs.length + ')',
    )
    for (const c of $app.findRecordsByFilter(
      'whatsapp_conexoes',
      "papel='vendedor' && ativo=true && fixture=false",
      '',
      50,
      0,
    )) {
      const nome = String(c.get('vendedor_nome_publico') || c.get('nome_exibicao') || c.id)
      const num = String(c.get('numero') || '').replace(/\D/g, '')
      const l8 = num.slice(-8)
      const partes = []
      try {
        const ms = $app.findRecordsByFilter(
          'whatsapp_mensagens',
          "contato_telefone~'" + l8 + "'",
          '-created',
          6,
          0,
        )
        for (const m of ms) {
          partes.push(
            (String(m.get('conexao')) === central
              ? 'CENTRAL'
              : 'cx:' + String(m.get('conexao')).slice(0, 6)) +
              '/' +
              String(m.get('direcao')) +
              '/' +
              String(m.get('created')).slice(0, 16),
          )
        }
      } catch (e1) {
        partes.push('erro:' + String(e1).slice(0, 60))
      }
      var interno = 'nao'
      try {
        const ni = $app.findRecordsByFilter(
          'whatsapp_numeros_internos',
          "numero~'" + l8 + "'",
          '',
          1,
          0,
        )
        interno = ni.length > 0 ? 'sim' : 'nao'
      } catch (e2) {
        interno = 'erro'
      }
      var conv = ''
      try {
        const cv = $app.findRecordsByFilter(
          'whatsapp_conversas',
          "contato_telefone~'" + l8 + "'",
          '-ultima_mensagem_em',
          3,
          0,
        )
        conv = cv
          .map(
            (x) =>
              (String(x.get('conexao')) === central ? 'CENTRAL' : 'cx') +
              '@' +
              String(x.get('ultima_mensagem_em')).slice(0, 16),
          )
          .join(',')
      } catch (e3) {}
      console.log(
        'tmp_1811_bomdia: ' +
          nome +
          ' interno=' +
          interno +
          ' msgs=[' +
          partes.join(' ') +
          '] conversas=[' +
          conv +
          ']',
      )
    }
  } catch (eTop) {
    console.log('tmp_1811_bomdia: erro ' + String(eTop).slice(0, 200))
  }
})
