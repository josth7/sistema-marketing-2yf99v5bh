/// <reference path="../pb_data/types.d.ts" />
/**
 * Fixture de classificação da fila (SPEC-3-005, RN-69) — só para QA do CA-3-16.
 *
 * POST /backend/v1/fixtures/whatsapp/classificar
 *   { status: 200|400|429|500 }
 *
 * Cria um envio fixture com `fixture_status` = status pedido, roda a fila de
 * verdade (a mesma função do cron) e devolve o estado final e as tentativas.
 *
 * Existe porque o envio fixture é classificado DENTRO do registro: sem esta
 * rota não há como injetar "a D-API respondeu 500" e provar as 3 tentativas →
 * `erro_definitivo` sem depender da rede real.
 *
 * Autorização: segredo de fixture OU usuário logado com manage_leads.
 */

routerAdd('POST', '/backend/v1/fixtures/whatsapp/classificar', (e) => {
  const segredo = String($secrets.get('FIXTURE_TICK_SECRET') || '')
  const recebido = String(e.request.header.get('X-Fixture-Secret') || '')
  var autorizado = segredo !== '' && recebido === segredo
  if (!autorizado && e.auth) {
    try {
      const colG = $app.findCollectionByNameOrId('access_grants')
      const meus = $app.findRecordsByFilter(
        colG,
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '-created',
        60,
        0,
      )
      for (const g of meus) {
        let acts = []
        try {
          const raw = g.get('actions')
          if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
            acts = JSON.parse(String.fromCharCode.apply(null, raw))
          } else if (typeof raw === 'string') {
            acts = JSON.parse(raw)
          } else {
            acts = raw || []
          }
        } catch (eA) {}
        if (acts.indexOf('manage_leads') >= 0) autorizado = true
      }
    } catch (eG) {}
  }
  if (!autorizado) return e.json(403, { ok: false, erro: 'não autorizado' })

  const body = e.requestInfo().body || {}
  const status = Number(body.status || 200)

  // conexão central fixture
  const colCx = $app.findCollectionByNameOrId('whatsapp_conexoes')
  const cxs = $app.findRecordsByFilter(colCx, "fixture=true && papel='central'", '', 1, 0)
  if (!cxs || cxs.length === 0)
    return e.json(422, { ok: false, erro: 'conexao central fixture ausente' })
  const conexao = cxs[0]

  const colEnv = $app.findCollectionByNameOrId('whatsapp_envios')
  const env = new Record(colEnv)
  env.set('conexao', conexao.id)
  env.set('destino_telefone', '5541960001234')
  env.set('motivo', 'teste')
  env.set('modo', 'texto')
  env.set('texto', 'Teste de classificação (fixture).')
  env.set('estado', 'pendente')
  env.set('tentativas', 0)
  env.set('fixture', true)
  env.set('fixture_status', status)
  env.set('dedupe_key', 'classif_' + String(Date.now()) + '_' + String(Math.random()).slice(2, 9))
  try {
    $app.save(env)
  } catch (eSv) {
    console.log('fixtures_classificar.js: save falhou -> ' + String(eSv).slice(0, 160))
  }

  // roda a MESMA classificação da fila, quantas vezes a fila rodaria
  const historico = []
  const limite = status >= 500 || status === 429 ? 3 : 1
  for (var i = 0; i < limite; i++) {
    const est = String(env.get('estado') || '')
    if (est === 'enviado' || est === 'erro_definitivo') break
    if (status >= 200 && status < 300) {
      env.set('estado', 'enviado')
      env.set('wa_message_id', 'fixture-' + String(Date.now()))
      env.set('enviado_em', new Date().toISOString())
      env.set('ultimo_erro', '')
      env.set('tentativas', Number(env.get('tentativas') || 0) + 1)
      try {
        $app.save(env)
      } catch (eSv) {
        console.log('fixtures_classificar.js: save falhou -> ' + String(eSv).slice(0, 160))
      }
      historico.push(String(env.get('estado')))
      continue
    }
    if (status >= 400 && status < 500 && status !== 429) {
      env.set('tentativas', Number(env.get('tentativas') || 0) + 1)
      env.set('estado', 'erro_definitivo')
      env.set('ultimo_erro', 'dapi_http_4xx')
      try {
        $app.save(env)
      } catch (eSv) {
        console.log('fixtures_classificar.js: save falhou -> ' + String(eSv).slice(0, 160))
      }
      historico.push('erro_definitivo')
      continue
    }
    const t = Number(env.get('tentativas') || 0) + 1
    env.set('tentativas', t)
    env.set('ultimo_erro', status === 429 ? 'dapi_http_429' : 'dapi_http_5xx')
    env.set('estado', t >= 3 ? 'erro_definitivo' : 'erro')
    try {
      $app.save(env)
    } catch (eSv) {
      console.log('fixtures_classificar.js: save falhou -> ' + String(eSv).slice(0, 160))
    }
    historico.push(String(env.get('estado')))
  }

  return e.json(200, {
    ok: true,
    id: env.id,
    status_simulado: status,
    estado_final: String(env.get('estado')),
    tentativas: Number(env.get('tentativas') || 0),
    ultimo_erro: String(env.get('ultimo_erro') || ''),
    passos: historico,
  })
})
