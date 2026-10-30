/// <reference path="../pb_data/types.d.ts" />
/**
 * Fila de envios pela API oficial — RN-69 (SPEC-3-005) + mídia (30/10).
 *
 * Pega os envios `pendente` e `erro`, tenta pela D-API e classifica:
 *   2xx        → `enviado` + wa_message_id
 *   4xx (≠429) → `erro_definitivo` (destino inválido — não adianta repetir)
 *   429/5xx/timeout → `erro`, volta na próxima rodada
 *   3 tentativas sem sucesso → `erro_definitivo`, visível na tela
 *
 * NOVO (Conversas 2.0): envio de MÍDIA pelo vendedor. O envio com `midia`
 * preenchido busca o arquivo em `whatsapp_midia` e chama a rota certa da D-API
 * (image/audio/video/document) com a URL pública do arquivo. A D-API aceita
 * URL pública — o id do registro é aleatório, então o link não é adivinhável.
 *
 * O motivo do envio diz o autor:
 *   ia_*              → a IA respondeu
 *   vendedor_*        → o vendedor respondeu PELO SISTEMA (autor_user)
 *   aviso e teste     → sistema
 *
 * Conexão fixture NUNCA chama a D-API real: usa a rota de fixture do próprio
 * sistema com `X-Fixture-Secret` (lição do projeto).
 *
 * JSVM: `$secrets.get` (não existe $os.env); corpo do $http.send volta como
 * ARRAY DE CHAR-CODES; lógica INLINE nos callbacks.
 */

cronAdd('whatsapp_envios_fila', '*/2 * * * *', () => {
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

    // ---------- mídia? ----------
    var midia = null
    var tipoMidia = ''
    try {
      const midiaId = String(env.get('midia') || '')
      if (midiaId !== '') {
        midia = $app.findRecordById('whatsapp_midia', midiaId)
        if (midia) tipoMidia = String(midia.get('tipo') || '')
      }
    } catch (eMid) {}

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
      if (chave === '' && secao !== 'DAPI_KEY_CENTRAL') {
        // todas as conexões estão na MESMA conta D-API: a chave da conta
        // (DAPI_KEY_CENTRAL) autoriza o envio de qualquer session. As chaves
        // por conexão (DAPI_KEY_FABIO etc.) nunca existiram no cofre —
        // descoberto em 30/10: resposta do vendedor morria aqui.
        try {
          chave = String($secrets.get('DAPI_KEY_CENTRAL') || '')
        } catch (eSec2) {}
      }
      if (chave === '') {
        env.set('ultimo_erro', 'chave_nao_configurada')
        try {
          $app.save(env)
        } catch (e6) {}
        continue
      }
      // rota certa por tipo (texto continua na rota antiga)
      if (midia) {
        if (tipoMidia === 'image') url = 'https://api.d-api.cloud/api/v1/messages/send/image'
        else if (tipoMidia === 'audio') url = 'https://api.d-api.cloud/api/v1/messages/send/audio'
        else if (tipoMidia === 'video') url = 'https://api.d-api.cloud/api/v1/messages/send/video'
        else url = 'https://api.d-api.cloud/api/v1/messages/send/document'
      } else {
        url = 'https://api.d-api.cloud/api/v1/messages/send/text'
      }
      auth = chave
    }

    const tentativas = Number(env.get('tentativas') || 0) + 1
    env.set('tentativas', tentativas)

    // ---------- corpo por tipo ----------
    var corpo = {}
    if (midia && !ehFixture) {
      // URL pública do arquivo: o id do registro é aleatório (não adivinhável)
      // o host do arquivo tem de ser o INTERNO: o domínio público serve só o
      // frontend (/api/files lá devolve HTML — verificado 30/10)
      var basePub = String($secrets.get('PB_INSTANCE_URL') || '')
      if (basePub === '') basePub = String($secrets.get('SITE_URL') || '')
      if (basePub === '') basePub = 'https://sistema-marketing-1f51e.shrd00.internal.goskip.dev'
      var urlArquivo =
        basePub + '/api/files/whatsapp_midia/' + midia.id + '/' + midia.get('arquivo')
      corpo = { sessionId: sessionId, to: destino }
      if (tipoMidia === 'image') corpo.image = urlArquivo
      else if (tipoMidia === 'audio') corpo.audio = urlArquivo
      else if (tipoMidia === 'video') corpo.video = urlArquivo
      else corpo.document = urlArquivo
      var legenda = String(env.get('legenda') || '')
      if (
        legenda !== '' &&
        (tipoMidia === 'image' || tipoMidia === 'video' || tipoMidia === 'document')
      ) {
        corpo.caption = legenda
      }
      if (tipoMidia === 'document') {
        corpo.filename = String(midia.get('nome_arquivo') || 'arquivo')
      }
    } else {
      corpo = { sessionId: sessionId, to: destino, text: texto }
      if (midia && ehFixture) {
        // fixture: a rota de teste só conhece texto; manda a legenda como texto
        var legendaF = String(env.get('legenda') || '')
        if (legendaF !== '') corpo.text = legendaF
      }
    }

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
        body: JSON.stringify(corpo),
        timeout: 20,
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
