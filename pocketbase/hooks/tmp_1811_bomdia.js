/// <reference path="../pb_data/types.d.ts" />
/**
 * TEMPORÁRIO (18/11) — só leitura: como estão saindo as apresentações
 * (motivo apresentacao_vendedor) e os avisos ao vendedor nas últimas 48h,
 * por número e estado, com o último erro. Sem telefone. Roda 1x por hora
 * cheia (minuto 15 e 45) até ser desligado.
 */
cronAdd('tmp_1811_bomdia', '*/5 * * * *', () => {
  if ($app.store().get('tmp_apres_feito')) return
  $app.store().set('tmp_apres_feito', true)
  try {
    const desde = new Date(Date.now() - 48 * 3600000).toISOString().replace('T', ' ').slice(0, 19)
    const nomes = {}
    for (const c of $app.findRecordsByFilter('whatsapp_conexoes', 'fixture=false', '', 50, 0)) {
      nomes[c.id] =
        String(c.get('vendedor_nome_publico') || c.get('nome_exibicao') || c.get('papel') || c.id) +
        (String(c.get('apresentacao_ativa')) === 'false' ? '(apres.desligada)' : '') +
        ' modelo=' +
        String(c.get('modelo_apresentacao_vendedor') || '-')
    }
    const g = {}
    const erros = {}
    for (const r of $app.findRecordsByFilter(
      'whatsapp_envios',
      "(motivo='apresentacao_vendedor' || motivo='aviso_vendedor') && fixture=false && created>='" +
        desde +
        "'",
      '-created',
      2000,
      0,
    )) {
      const k =
        String(r.get('motivo')) +
        '|' +
        (nomes[String(r.get('conexao'))] || String(r.get('conexao'))) +
        '|' +
        String(r.get('estado'))
      g[k] = (g[k] || 0) + 1
      const err = String(r.get('ultimo_erro') || '').slice(0, 90)
      if (err !== '' && !erros[k]) erros[k] = err + ' @' + String(r.get('updated')).slice(5, 16)
    }
    for (const k in g)
      console.log(
        'tmp_1811_apres: ' + k + ' = ' + g[k] + (erros[k] ? ' | ult.erro: ' + erros[k] : ''),
      )
    // leads transferidos nas últimas 48h por dono, para comparar
    const tr = {}
    for (const t of $app.findRecordsByFilter(
      'whatsapp_transferencias',
      "created>='" + desde + "'",
      '',
      2000,
      0,
    )) {
      const k = String(t.get('estado') || '') + '|' + String(t.get('regra') || '')
      tr[k] = (tr[k] || 0) + 1
    }
    console.log('tmp_1811_apres: transferencias 48h ' + JSON.stringify(tr))
  } catch (e) {
    console.log('tmp_1811_apres: erro ' + String(e).slice(0, 200))
  }
})
