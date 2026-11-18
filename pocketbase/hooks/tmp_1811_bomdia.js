/// <reference path="../pb_data/types.d.ts" />
// TEMPORÁRIO (18/11) — só leitura: as respostas dos vendedores pelo celular
// (eco da coexistência) estão chegando? Contagem de hoje por número, direção
// e autor; e o caso MS Studio (lead 1z6lo1jgvs9jo7h) em qualquer número.
cronAdd('tmp_1811_bomdia', '* * * * *', () => {
  if ($app.store().get('tmp_eco')) return
  $app.store().set('tmp_eco', true)
  try {
    const nomes = {}
    for (const c of $app.findRecordsByFilter('whatsapp_conexoes', 'fixture=false', '', 50, 0)) {
      nomes[c.id] = String(
        c.get('vendedor_nome_publico') || c.get('nome_exibicao') || c.get('papel'),
      )
    }
    const cont = {}
    for (const m of $app.findRecordsByFilter(
      'whatsapp_mensagens',
      "created>='2026-11-18 03:00:00' && fixture=false",
      '',
      20000,
      0,
    )) {
      const k =
        (nomes[String(m.get('conexao'))] || '?') +
        '|' +
        String(m.get('direcao')) +
        '|' +
        String(m.get('autor'))
      cont[k] = (cont[k] || 0) + 1
    }
    console.log('tmp_eco: mensagens hoje ' + JSON.stringify(cont))
    const ev = {}
    for (const e of $app.findRecordsByFilter(
      'whatsapp_eventos',
      "created>='2026-11-18 03:00:00'",
      '',
      20000,
      0,
    )) {
      const k =
        (nomes[String(e.get('conexao'))] || String(e.get('conexao')).slice(0, 6)) +
        '|' +
        String(e.get('tipo') || e.get('evento') || e.get('event') || '?')
      ev[k] = (ev[k] || 0) + 1
    }
    console.log('tmp_eco: eventos hoje ' + JSON.stringify(ev).slice(0, 1500))
    const lead = $app.findRecordById('crm_leads', '1z6lo1jgvs9jo7h')
    const l8 = String(lead.get('telefone') || '')
      .replace(/\D/g, '')
      .slice(-8)
    const ms = $app.findRecordsByFilter(
      'whatsapp_mensagens',
      "contato_telefone~'" + l8 + "' || lead='1z6lo1jgvs9jo7h'",
      '-created',
      10,
      0,
    )
    console.log(
      'tmp_eco: ms_studio ' +
        ms
          .map(
            (m) =>
              (nomes[String(m.get('conexao'))] || '?') +
              '/' +
              String(m.get('direcao')) +
              '/' +
              String(m.get('created')).slice(0, 16),
          )
          .join(' '),
    )
  } catch (e) {
    console.log('tmp_eco: erro ' + String(e).slice(0, 200))
  }
})
