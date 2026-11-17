/// <reference path="../pb_data/types.d.ts" />
/**
 * TEMPORÁRIO (17/11, consultor Adapta) — SÓ LEITURA. Apagar depois de rodar.
 *
 * A apresentação pelo número da Elisângela voltou "(#132001) Template name does
 * not exist in the translation". Lista, direto na D-API, os modelos de CADA
 * número (central e vendedores) para saber em qual conta o
 * `haisan_apresentacao_vendedor` (pt_BR) existe e está aprovado.
 * Roda UMA vez entre 20:06 e 20:30 UTC de 17/11/2026. Chave nunca vai ao log.
 */
cronAdd('tmp_1711_consultor', '* * * * *', () => {
  const agora = new Date().getTime()
  const ini = new Date('2026-11-17T20:06:00Z').getTime()
  const fim = new Date('2026-11-17T20:30:00Z').getTime()
  if (agora < ini || agora > fim) return
  try {
    if ($app.store().get('tmp1711_v6') === true) return
    $app.store().set('tmp1711_v6', true)
  } catch (eSt) {
    if (new Date().getUTCMinutes() % 10 !== 6) return
  }
  const P = 'tmp1711f: '

  // o envio forçado de 20:01
  try {
    const en = $app.findRecordById('whatsapp_envios', '59d096o4fhwaqns')
    console.log(
      P +
        'envio forcado: estado=' +
        en.get('estado') +
        ' | tent=' +
        en.get('tentativas') +
        ' | erro=' +
        String(en.get('ultimo_erro') || '')
          .replace(/[0-9]{8,}/g, '***')
          .slice(0, 80),
    )
  } catch (eEn) {}

  var cxs = []
  try {
    cxs = $app.findRecordsByFilter('whatsapp_conexoes', 'ativo=true && fixture=false', '', 50, 0)
  } catch (eC) {}
  for (const c of cxs) {
    const nome = String(c.get('nome_exibicao') || '') + '/' + String(c.get('papel') || '')
    const sessao = String(c.get('session_id') || '')
    var chave = ''
    try {
      const nc = String(c.get('nome_segredo_chave') || 'DAPI_API_KEY')
      chave = String($secrets.get(nc) || '')
    } catch (eK) {}
    if (sessao === '' || chave === '') {
      console.log(P + nome + ' | sem sessao ou sem chave')
      continue
    }
    try {
      const r = $http.send({
        url:
          'https://api.d-api.cloud/api/v1/connections/cloud-api/' +
          encodeURIComponent(sessao) +
          '/templates',
        method: 'GET',
        headers: { Authorization: chave, Accept: 'application/json' },
        timeout: 25,
      })
      var corpo = r.body
      if (Array.isArray(corpo)) corpo = String.fromCharCode.apply(null, corpo)
      const st = Number(r.statusCode || 0)
      var lista = []
      try {
        const j = JSON.parse(String(corpo))
        lista = j.data || j.templates || j
        if (!Array.isArray(lista)) lista = []
      } catch (eP) {}
      const resumo = []
      for (const t of lista) {
        resumo.push(
          String(t.name || t.nome || '') +
            '|' +
            String(t.language || t.idioma || '') +
            '|' +
            String(t.status || '') +
            '|' +
            String(t.category || ''),
        )
      }
      console.log(
        P +
          nome +
          ' | sessao=' +
          sessao.slice(0, 14) +
          ' | modelo_da_conexao=' +
          String(c.get('modelo_apresentacao_vendedor') || c.get('modelo_aviso_vendedor') || '') +
          ' | HTTP ' +
          st +
          ' | ' +
          resumo.length +
          ' modelos: ' +
          resumo.join(' ; ').slice(0, 900) +
          (st >= 300
            ? ' | corpo=' +
              String(corpo)
                .replace(/[0-9]{10,}/g, '***')
                .slice(0, 200)
            : ''),
      )
    } catch (eH) {
      console.log(P + nome + ' | falhou chamar D-API: ' + String(eH).slice(0, 120))
    }
  }
})
