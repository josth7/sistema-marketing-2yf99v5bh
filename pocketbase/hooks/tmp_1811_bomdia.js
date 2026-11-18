/// <reference path="../pb_data/types.d.ts" />
// TEMPORÁRIO (18/11) — só leitura: conversa em branco e contato na aba Equipe.
cronAdd('tmp_1811_bomdia', '* * * * *', () => {
  if ($app.store().get('tmp_diag2')) return
  $app.store().set('tmp_diag2', true)
  try {
    const f8 = '99601233'
    const ni = $app.findRecordsByFilter(
      'whatsapp_numeros_internos',
      "numero~'" + f8 + "'",
      '',
      5,
      0,
    )
    const cxA = $app.findRecordsByFilter('whatsapp_conexoes', "numero~'" + f8 + "'", '', 5, 0)
    const cvA = $app.findRecordsByFilter(
      'whatsapp_conversas',
      "contato_telefone~'" + f8 + "'",
      '',
      10,
      0,
    )
    console.log(
      'tmp_anny: conexoes=' +
        cxA.length +
        ' internos=' +
        ni.length +
        (ni.length ? ' rotulo=' + String(ni[0].get('rotulo')) : '') +
        ' conversas=' +
        cvA.map((c) => 'interna:' + String(c.get('interna'))).join(','),
    )
  } catch (e) {
    console.log('tmp_anny: erro ' + String(e).slice(0, 120))
  }
  try {
    const conv = $app.findRecordById('whatsapp_conversas', '1rd91r40263o3bs')
    const cx = String(conv.get('conexao'))
    const tel = String(conv.get('contato_telefone'))
    const l8 = tel.replace(/\D/g, '').slice(-8)
    const exato = $app.findRecordsByFilter(
      'whatsapp_mensagens',
      "conexao='" + cx + "' && contato_telefone='" + tel + "'",
      '',
      300,
      0,
    )
    const fim = $app.findRecordsByFilter(
      'whatsapp_mensagens',
      "conexao='" + cx + "' && contato_telefone~'" + l8 + "'",
      '',
      300,
      0,
    )
    const qualquer = $app.findRecordsByFilter(
      'whatsapp_mensagens',
      "contato_telefone~'" + l8 + "'",
      '-created',
      300,
      0,
    )
    const porCx = {}
    for (const m of qualquer) {
      const k =
        String(m.get('conexao')).slice(0, 6) +
        '/' +
        String(m.get('direcao')) +
        '/tel' +
        String(m.get('contato_telefone')).replace(/\D/g, '').length
      porCx[k] = (porCx[k] || 0) + 1
    }
    const env = $app.findRecordsByFilter(
      'whatsapp_envios',
      "conexao='" + cx + "' && destino_telefone~'" + l8 + "' && estado='enviado'",
      '',
      300,
      0,
    )
    console.log(
      'tmp_branco: conv.cx=' +
        cx.slice(0, 6) +
        ' tel.len=' +
        tel.replace(/\D/g, '').length +
        ' exato=' +
        exato.length +
        ' fim8=' +
        fim.length +
        ' qualquer=' +
        JSON.stringify(porCx) +
        ' envios_enviados=' +
        env.length,
    )
  } catch (e2) {
    console.log('tmp_branco: erro ' + String(e2).slice(0, 150))
  }
})
