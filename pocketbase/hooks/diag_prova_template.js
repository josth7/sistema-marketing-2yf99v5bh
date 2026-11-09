/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA (09/11) — o formato do template passa na D-API? (CA-3-106)
 *
 * Cria um envio de MODELO para um número da equipe (a Anezia), com as duas
 * variáveis preenchidas, e mostra o que a D-API respondeu.
 *
 * **Não vai para cliente.** O destino é um número interno da própria Haisan.
 * Se o formato estiver certo, a resposta é 2xx e o envio fica `enviado`.
 *
 * GET /backend/v1/diag/prova-template
 */
routerAdd(
  'GET',
  '/backend/v1/diag/prova-template',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, respostas: [] }

    // usa a conexão central e o modelo aprovado de apresentação
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
    if (!cx)
      return e.json(200, { ok: false, erro: 'sem conexão de vendedor com apresentação ligada' })

    // número interno da Anezia (não é cliente)
    var destino = '5541999601233'
    const modelo = String(cx.get('modelo_apresentacao_vendedor') || '')
    if (modelo === '') {
      return e.json(200, { ok: false, erro: 'a conexão não tem modelo de apresentação' })
    }

    // cria na fila com legenda preenchida
    var envId = ''
    try {
      const env = new Record(app.findCollectionByNameOrId('whatsapp_envios'))
      env.set('conexao', cx.id)
      env.set('destino_telefone', destino)
      env.set('motivo', 'teste')
      env.set('modo', 'modelo')
      env.set('modelo_nome', modelo)
      env.set('legenda', 'Anezia|Fabio')
      env.set('texto', 'prova do formato CA-3-106')
      env.set('estado', 'pendente')
      env.set('tentativas', 0)
      env.set('dedupe_key', 'prova-template-' + String(new Date().getTime()))
      env.set('fixture', true)
      app.save(env)
      envId = env.id
    } catch (e1) {
      return e.json(200, { ok: false, erro: 'criar envio: ' + String(e1).slice(0, 120) })
    }

    // chama a D-API com o formato NOVO, direto, para ver a resposta
    var chave = ''
    try {
      const nomeChave = String(cx.get('nome_segredo_chave') || '')
      if (nomeChave !== '') chave = String($secrets.get(nomeChave) || '')
    } catch (e2) {}

    var corpo = {
      sessionId: String(cx.get('session_id') || ''),
      to: destino,
      template: {
        name: modelo,
        language: 'pt_BR',
        bodyVariables: ['Anezia', 'Fabio'],
      },
    }

    var status = 0
    var resposta = ''
    try {
      const r = $http.send({
        url: 'https://api.d-api.cloud/api/v1/messages/send/template',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: chave },
        body: JSON.stringify(corpo),
        timeout: 25,
      })
      status = Number(r.statusCode || 0)
      var rb = r.body
      if (Array.isArray(rb)) resposta = String.fromCharCode.apply(null, rb)
      else resposta = String(rb)
    } catch (e3) {
      return e.json(200, { ok: false, erro: 'D-API: ' + String(e3).slice(0, 100), envio: envId })
    }

    out.status = status
    // mascara telefone e chave
    out.resposta = resposta
      .replace(/[0-9]{10,}/g, '***')
      .replace(/"Authorization"[^,]*/gi, '"Authorization":"***"')
      .slice(0, 300)
    out.formato_usado = { language: 'pt_BR (texto)', bodyVariables: ['Anezia', 'Fabio'] }
    out.envio_criado = envId

    // limpa o envio de prova
    try {
      app.delete(app.findRecordById('whatsapp_envios', envId))
    } catch (e4) {}

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
