/// <reference path="../pb_data/types.d.ts" />
/**
 * TEMPORÁRIO (17/11, consultor Adapta) — SÓ LEITURA. Apagar depois de rodar.
 *
 * A Meta disse que a empresa "está nos EUA" (erro 130497). Pergunta à D-API,
 * para cada número (central e vendedores), os dados da conexão: WABA, portfólio
 * dono, país, verificação, limite. Só loga campos de identificação/estado —
 * nunca token, chave ou segredo. Roda UMA vez entre 20:41 e 21:00 UTC.
 */
cronAdd('tmp_1711_consultor', '* * * * *', () => {
  const agora = new Date().getTime()
  const ini = new Date('2026-11-17T20:41:00Z').getTime()
  const fim = new Date('2026-11-17T21:00:00Z').getTime()
  if (agora < ini || agora > fim) return
  try {
    if ($app.store().get('tmp1711_v8') === true) return
    $app.store().set('tmp1711_v8', true)
  } catch (eSt) {
    if (new Date().getUTCMinutes() % 10 !== 1) return
  }
  const P = 'tmp1711h: '
  const BOM =
    /waba|business|phone|country|pais|name|nome|status|quality|limit|verif|tier|account|owner|region|currency|timezone|display|id$/i
  const RUIM = /token|secret|key|password|senha|auth|cookie|webhook|url/i

  function coleta(obj, prefixo, out, prof) {
    if (prof > 4 || obj === null || obj === undefined) return
    if (Array.isArray(obj)) {
      for (var i = 0; i < obj.length && i < 5; i++)
        coleta(obj[i], prefixo + '[' + i + ']', out, prof + 1)
      return
    }
    if (typeof obj !== 'object') return
    for (const k in obj) {
      const v = obj[k]
      const nome = prefixo === '' ? k : prefixo + '.' + k
      if (RUIM.test(k)) continue
      if (v !== null && typeof v === 'object') {
        coleta(v, nome, out, prof + 1)
      } else if (BOM.test(k)) {
        var s = String(v)
        if (/^55\d{10,11}$/.test(s.replace(/\D/g, ''))) s = '55***' + s.replace(/\D/g, '').slice(-4)
        out.push(nome + '=' + s.slice(0, 60))
      }
    }
  }

  var cxs = []
  try {
    cxs = $app.findRecordsByFilter('whatsapp_conexoes', 'ativo=true && fixture=false', '', 50, 0)
  } catch (eC) {}
  for (const c of cxs) {
    const nomeCx = String(c.get('nome_exibicao') || '') + '/' + String(c.get('papel') || '')
    const sessao = String(c.get('session_id') || '')
    var chave = ''
    try {
      chave = String($secrets.get(String(c.get('nome_segredo_chave') || 'DAPI_API_KEY')) || '')
    } catch (eK) {}
    if (sessao === '' || chave === '') {
      console.log(P + nomeCx + ' | sem sessao ou chave')
      continue
    }
    const urls = [
      'https://api.d-api.cloud/api/v1/connections/cloud-api/' + encodeURIComponent(sessao),
      'https://api.d-api.cloud/api/v1/connections/' + encodeURIComponent(sessao),
      'https://api.d-api.cloud/api/v1/connections/cloud-api/' +
        encodeURIComponent(sessao) +
        '/profile',
    ]
    var achou = false
    const tentativas = []
    for (const u of urls) {
      if (achou) break
      try {
        const r = $http.send({
          url: u,
          method: 'GET',
          headers: { Authorization: chave, Accept: 'application/json' },
          timeout: 20,
        })
        const st = Number(r.statusCode || 0)
        tentativas.push(
          u.replace('https://api.d-api.cloud/api/v1/', '').replace(sessao, 'S') + '=' + st,
        )
        if (st >= 200 && st < 300) {
          var corpo = r.body
          if (Array.isArray(corpo)) corpo = String.fromCharCode.apply(null, corpo)
          var j = null
          try {
            j = JSON.parse(String(corpo))
          } catch (eP) {}
          const out = []
          if (j) coleta(j, '', out, 0)
          console.log(
            P +
              nomeCx +
              ' | sessao=' +
              sessao.slice(0, 14) +
              ' | ' +
              u.replace('https://api.d-api.cloud/api/v1/', '').replace(sessao, 'S') +
              ' | ' +
              out.join(' ; ').slice(0, 1200),
          )
          achou = true
        }
      } catch (eH) {
        tentativas.push('erro')
      }
    }
    if (!achou) console.log(P + nomeCx + ' | nenhuma rota respondeu: ' + tentativas.join(', '))
  }
})
