/// <reference path="../pb_data/types.d.ts" />
/**
 * TEMPORÁRIO (18/11) — só leitura: lista os modelos que a Meta tem em cada
 * número de vendedor (nome, status, idioma, categoria e corpo curto). Nada é
 * enviado. Sem chave nem telefone no log. APAGAR depois.
 */
cronAdd('tmp_1811_bomdia', '*/2 * * * *', () => {
  if ($app.store().get('tmp_modelos_feito')) return
  $app.store().set('tmp_modelos_feito', true)
  try {
    for (const cx of $app.findRecordsByFilter(
      'whatsapp_conexoes',
      'ativo=true && fixture=false',
      '',
      50,
      0,
    )) {
      const nome = String(
        cx.get('vendedor_nome_publico') || cx.get('nome_exibicao') || cx.get('papel'),
      )
      const sessao = String(cx.get('session_id') || '')
      var chave = ''
      try {
        const n = String(cx.get('nome_segredo_chave') || '')
        if (n !== '') chave = String($secrets.get(n) || '')
        if (chave === '') chave = String($secrets.get('DAPI_USER_KEY') || '')
      } catch (e1) {}
      if (sessao === '') {
        console.log('tmp_modelos: ' + nome + ' sem sessão')
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
        if (st < 200 || st >= 300) {
          console.log('tmp_modelos: ' + nome + ' HTTP ' + st + ' ' + String(corpo).slice(0, 120))
          continue
        }
        const j = JSON.parse(String(corpo))
        var lista = j.data || j.templates || j
        if (!Array.isArray(lista)) lista = []
        const itens = []
        for (const t of lista) {
          var body = ''
          for (const c of t.components || [])
            if (String(c.type || '').toUpperCase() === 'BODY') body = String(c.text || '')
          itens.push(
            String(t.name) +
              '[' +
              String(t.status) +
              ',' +
              String(t.language) +
              ',' +
              String(t.category) +
              '] "' +
              body.replace(/\s+/g, ' ').slice(0, 70) +
              '"',
          )
        }
        console.log('tmp_modelos: ' + nome + ' (' + itens.length + ') ' + itens.join(' ; '))
      } catch (e2) {
        console.log('tmp_modelos: ' + nome + ' erro ' + String(e2).slice(0, 100))
      }
    }
  } catch (e) {
    console.log('tmp_modelos: erro ' + String(e).slice(0, 150))
  }
})
