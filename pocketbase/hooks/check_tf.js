/// <reference path="../pb_data/types.d.ts" />
/**
 * TESTE DA FILA DE PONTA A PONTA (11/11).
 *
 * O envio direto pela D-API responde 200, mas a FILA marca `dapi_http_5xx`.
 * Aqui se cria UM envio real na fila e se acompanha: qual URL, qual corpo,
 * qual status e qual corpo de resposta.
 *
 * GET /backend/v1/check/testa-fila
 */
routerAdd(
  'GET',
  '/backend/v1/check/testa-fila',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true }

    // conexão do Fábio
    var cx = null
    try {
      const cs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor' && ativo=true && apresentacao_ativa=true",
        '',
        1,
        0,
      )
      if (cs.length > 0) cx = cs[0]
    } catch (e0) {}
    if (!cx) return e.json(200, { ok: false, erro: 'sem vendedor com apresentação' })

    // cria o envio na fila
    var envId = ''
    try {
      const env = new Record(app.findCollectionByNameOrId('whatsapp_envios'))
      env.set('conexao', cx.id)
      env.set('destino_telefone', '5541999601233')
      env.set('motivo', 'teste')
      env.set('modo', 'modelo')
      env.set('modelo_nome', String(cx.get('modelo_apresentacao_vendedor') || ''))
      env.set('legenda', 'Anezia|Fabio')
      env.set('texto', 'teste fila 5xx')
      env.set('estado', 'pendente')
      env.set('tentativas', 0)
      env.set('dedupe_key', 'teste-fila-' + String(new Date().getTime()))
      env.set('fixture', false)
      app.save(env)
      envId = env.id
    } catch (e1) {
      return e.json(200, { ok: false, erro: 'criar: ' + String(e1).slice(0, 120) })
    }

    out.envio = envId
    out.fila = 'criado como pendente; o cron de 2 min vai tentar'
    out.aviso = 'consulte /check/resultado-fila em 1 minuto para ver o status'

    // TAMBÉM faz o POST igual ao da fila, mas daqui, para comparar
    const secao = String(cx.get('nome_segredo_chave') || 'DAPI_API_KEY')
    var chave = ''
    try {
      chave = String($secrets.get(secao) || '')
    } catch (e2) {}

    var st = 0
    var resp = ''
    try {
      const r = $http.send({
        url: 'https://api.d-api.cloud/api/v1/messages/send/template',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: chave },
        body: JSON.stringify({
          sessionId: String(cx.get('session_id') || ''),
          to: '5541999601233',
          template: {
            name: String(cx.get('modelo_apresentacao_vendedor') || ''),
            language: 'pt_BR',
            bodyVariables: ['Anezia', 'Fabio'],
          },
        }),
        timeout: 22,
      })
      st = Number(r.statusCode || 0)
      var rb = r.body
      if (Array.isArray(rb)) resp = String.fromCharCode.apply(null, rb)
      else resp = String(rb)
    } catch (e3) {
      resp = 'exc: ' + String(e3).slice(0, 80)
    }
    out.mesmo_post = { status: st, resposta: resp.replace(/[0-9]{10,}/g, '***').slice(0, 150) }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)

// consulta o resultado do envio de teste
routerAdd(
  'GET',
  '/backend/v1/check/resultado-fila',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    var envs = []
    try {
      envs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        "dedupe_key~'teste-fila-'",
        '',
        10,
        0,
      )
    } catch (e0) {}

    const out = { ok: true, itens: [] }
    for (const en of envs) {
      out.itens.push({
        estado: String(en.get('estado') || ''),
        erro: String(en.get('ultimo_erro') || ''),
        tentativas: Number(en.get('tentativas') || 0),
        wamid: String(en.get('wa_message_id') || '') !== '',
        destinatario_original: String(en.get('destino_telefone') || '').slice(-6),
      })
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
