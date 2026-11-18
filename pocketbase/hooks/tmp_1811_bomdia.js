/// <reference path="../pb_data/types.d.ts" />
// TEMPORÁRIO (18/11) — só leitura: por que um contato caiu na aba Equipe.
cronAdd('tmp_1811_bomdia', '* * * * *', () => {
  if ($app.store().get('tmp_anny')) return
  $app.store().set('tmp_anny', true)
  const f8 = '99601233'
  try {
    const cx = $app.findRecordsByFilter('whatsapp_conexoes', "numero~'" + f8 + "'", '', 5, 0)
    const ni = $app.findRecordsByFilter(
      'whatsapp_numeros_internos',
      "numero~'" + f8 + "'",
      '',
      5,
      0,
    )
    const cv = $app.findRecordsByFilter(
      'whatsapp_conversas',
      "contato_telefone~'" + f8 + "'",
      '',
      10,
      0,
    )
    console.log(
      'tmp_anny: conexoes=' +
        cx.length +
        ' internos=' +
        ni.length +
        (ni.length
          ? ' rotulo=' +
            String(ni[0].get('rotulo')) +
            ' criado=' +
            String(ni[0].get('created')).slice(0, 16)
          : '') +
        ' conversas=' +
        cv
          .map(
            (c) =>
              'interna:' +
              String(c.get('interna')) +
              '/lead:' +
              (String(c.get('lead')) ? 's' : 'n'),
          )
          .join(','),
    )
  } catch (e) {
    console.log('tmp_anny: erro ' + String(e).slice(0, 120))
  }
})
