/// <reference path="../pb_data/types.d.ts" />
/**
 * Fixture da fila de envios (SPEC-3-005, RN-69) — só para QA.
 *
 * POST /backend/v1/fixtures/whatsapp/envios
 *   { status: 200|500|429|400, destino?: string }
 *
 * Cria um envio fixture na conexão central fixture e o processa AGORA,
 * aplicando a mesma classificação da fila real:
 *   2xx → enviado · 4xx(≠429) → erro_definitivo · 429/5xx → erro (3x → definitivo)
 *
 * Existe porque o cron da fila roda a cada 10 min e a prova precisa ser imediata.
 * Protegida por X-Fixture-Secret = FIXTURE_TICK_SECRET; só toca registros fixture.
 */

routerAdd('POST', '/backend/v1/fixtures/whatsapp/envios', (e) => {
  const segredo = String($secrets.get('FIXTURE_TICK_SECRET') || '')
  const recebido = String(e.request.header.get('X-Fixture-Secret') || '')
  if (segredo === '' || recebido !== segredo) {
    return e.json(403, { ok: false, erro: 'segredo de fixture inválido' })
  }

  const body = e.requestInfo().body || {}
  const statusAlvo = Number(body.status || 200)
  const destino = String(body.destino || '5541988887777')

  // conexão central fixture (criada na migração 0073)
  const colCx = $app.findCollectionByNameOrId('whatsapp_conexoes')
  const cxs = $app.findRecordsByFilter(colCx, "fixture=true && papel='central'", '', 1, 0)
  if (!cxs || cxs.length === 0) {
    return e.json(422, { ok: false, erro: 'conexao central fixture ausente' })
  }
  const conexao = cxs[0]

  // cria o envio
  const colEnv = $app.findCollectionByNameOrId('whatsapp_envios')
  const env = new Record(colEnv)
  env.set('conexao', conexao.id)
  env.set('destino_telefone', destino)
  env.set('motivo', 'teste')
  env.set('modo', 'texto')
  env.set('texto', 'Teste de fila (fixture). Pode ignorar.')
  env.set('estado', 'pendente')
  env.set('tentativas', 0)
  env.set('fixture', true)
  env.set(
    'dedupe_key',
    'fixture_envio_' + String(Date.now()) + '_' + String(Math.random()).slice(2, 8),
  )
  $app.save(env)

  // processa AGORA (mesma classificação da fila real)
  const historico = []
  const limite = statusAlvo >= 500 || statusAlvo === 429 ? 3 : 1
  var estadoFinal = ''
  for (var i = 0; i < limite; i++) {
    const url =
      String($secrets.get('SITE_URL') || '') +
      '/backend/v1/fixtures/dapi/send?status=' +
      String(statusAlvo)
    var st = 0
    try {
      const resp = $http.send({
        url: url,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Fixture-Secret': segredo,
        },
        body: JSON.stringify({
          sessionId: 'fixture-central-qa',
          to: destino,
          text: String(env.get('texto')),
        }),
        timeout: 10,
      })
      st = Number(resp.statusCode || 0)
    } catch (eH) {
      st = 0
    }
    const tent = Number(env.get('tentativas') || 0) + 1
    env.set('tentativas', tent)

    if (st >= 200 && st < 300) {
      env.set('estado', 'enviado')
      env.set('enviado_em', new Date().toISOString())
      env.set('ultimo_erro', '')
      historico.push({ tentativa: tent, status: st, estado: 'enviado' })
      estadoFinal = 'enviado'
      break
    }
    if (st >= 400 && st < 500 && st !== 429) {
      env.set('estado', 'erro_definitivo')
      env.set('ultimo_erro', 'dapi_http_4xx')
      historico.push({ tentativa: tent, status: st, estado: 'erro_definitivo' })
      estadoFinal = 'erro_definitivo'
      break
    }
    env.set('ultimo_erro', st === 429 ? 'dapi_http_429' : 'dapi_http_5xx')
    env.set('estado', tent >= 3 ? 'erro_definitivo' : 'erro')
    historico.push({ tentativa: tent, status: st, estado: String(env.get('estado')) })
    estadoFinal = String(env.get('estado'))
  }
  $app.save(env)

  return e.json(200, {
    ok: true,
    id: env.id,
    estado: estadoFinal,
    tentativas: Number(env.get('tentativas') || 0),
    ultimo_erro: String(env.get('ultimo_erro') || ''),
    historico: historico,
  })
})
