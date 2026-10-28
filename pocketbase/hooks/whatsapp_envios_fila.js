/// <reference path="../pb_data/types.d.ts" />
/**
 * Fila de envios pela API oficial — RN-69 (SPEC-3-005, CA-3-16).
 *
 * Pega os envios `pendente` e `erro`, tenta pela D-API e classifica:
 *   2xx        → `enviado` + wa_message_id
 *   4xx (≠429) → `erro_definitivo` (destino inválido — não adianta repetir)
 *   429/5xx/timeout → `erro`, volta na próxima rodada
 *   3 tentativas sem sucesso → `erro_definitivo`, visível na tela
 *
 * Conexão fixture NUNCA chama a D-API real: usa a rota de fixture do próprio
 * sistema com `X-Fixture-Secret` (lição do projeto).
 *
 * JSVM: `$secrets.get` (não existe $os.env); corpo do $http.send volta como
 * ARRAY DE CHAR-CODES; lógica INLINE nos callbacks.
 */

cronAdd('whatsapp_envios_fila', '*/10 * * * *', () => {
  const colEnv = $app.findCollectionByNameOrId('whatsapp_envios')
  const alvos = []
  try {
    const pendentes = $app.findRecordsByFilter(colEnv, 'estado="pendente"', '', 100, 0)
    for (const p of pendentes) alvos.push(p)
  } catch (e1) {}
  try {
    const comErro = $app.findRecordsByFilter(colEnv, 'estado="erro"', '', 100, 0)
    for (const p of comErro) {
      if (Number(p.get('tentativas') || 0) >= 3) {
        p.set('estado', 'erro_definitivo')
        try {
          $app.save(p)
        } catch (e2) {}
        continue
      }
      alvos.push(p)
    }
  } catch (e3) {}

  for (const env of alvos) {
    // ---------- destino válido? ----------
    const destino = String(env.get('destino_telefone') || '')
    if (destino.replace(/\D/g, '').length < 10) {
      env.set('estado', 'sem_numero')
      env.set('ultimo_erro', 'destino_invalido')
      try {
        $app.save(env)
      } catch (e4) {}
      continue
    }

    // ---------- conexão ----------
    let conexao = null
    try {
      conexao = $app.findRecordById('whatsapp_conexoes', String(env.get('conexao') || ''))
    } catch (_) {
      env.set('estado', 'erro_definitivo')
      env.set('ultimo_erro', 'conexao_nao_encontrada')
      try {
        $app.save(env)
      } catch (e5) {}
      continue
    }

    const ehFixture =
      String(env.get('fixture')) === 'true' || String(conexao.get('fixture')) === 'true'
    const texto = String(env.get('texto') || '')
    const sessionId = String(conexao.get('session_id') || '')
    const secao = String(conexao.get('nome_segredo_chave') || 'DAPI_API_KEY')

    var url = ''
    var auth = ''
    if (ehFixture) {
      var baseFit = String($secrets.get('SITE_URL') || '')
      if (baseFit === '') baseFit = 'https://sistema-marketing-1f51e.shrd03.internal.goskip.dev'
      url = baseFit + '/backend/v1/fixtures/dapi/send'
      auth = String($secrets.get('FIXTURE_TICK_SECRET') || '')
    } else {
      var chave = ''
      try {
        chave = String($secrets.get(secao) || '')
      } catch (eSec) {}
      if (chave === '') {
        env.set('ultimo_erro', 'chave_nao_configurada')
        try {
          $app.save(env)
        } catch (e6) {}
        continue
      }
      url = 'https://api.deliverify.io/api/v1/messages/send/text'
      auth = chave
    }

    const tentativas = Number(env.get('tentativas') || 0) + 1
    env.set('tentativas', tentativas)

    var status = 0
    var corpoResp = ''
    try {
      const resp = $http.send({
        url: url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: auth,
          'X-Fixture-Secret': ehFixture ? auth : '',
        },
        body: JSON.stringify({ sessionId: sessionId, to: destino, text: texto }),
        timeout: 10,
      })
      status = Number(resp.statusCode || 0)
      var raw = resp.body
      if (Array.isArray(raw)) corpoResp = String.fromCharCode.apply(null, raw)
      else if (typeof raw === 'string') corpoResp = raw
    } catch (eHttp) {
      env.set('estado', tentativas >= 3 ? 'erro_definitivo' : 'erro')
      env.set('ultimo_erro', 'dapi_transporte')
      try {
        $app.save(env)
      } catch (e7) {}
      continue
    }

    if (status >= 200 && status < 300) {
      var idEnviado = ''
      try {
        const j = JSON.parse(corpoResp)
        idEnviado = String(j.id || j.messageId || (j.data ? j.data.id : '') || '')
      } catch (eP) {}
      env.set('estado', 'enviado')
      env.set('ultimo_erro', '')
      env.set('wa_message_id', idEnviado)
      env.set('enviado_em', new Date().toISOString())
      try {
        $app.save(env)
      } catch (e8) {}
      continue
    }

    if (status >= 400 && status < 500 && status !== 429) {
      env.set('estado', 'erro_definitivo')
      env.set('ultimo_erro', 'dapi_http_4xx')
      try {
        $app.save(env)
      } catch (e9) {}
      continue
    }

    env.set('ultimo_erro', status === 429 ? 'dapi_http_429' : 'dapi_http_5xx')
    env.set('estado', tentativas >= 3 ? 'erro_definitivo' : 'erro')
    try {
      $app.save(env)
    } catch (e10) {}
  }
})
