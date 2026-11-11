/// <reference path="../pb_data/types.d.ts" />
/**
 * TESTE COMPARATIVO DA FILA (11/11) — o mesmo envio pelos dois caminhos.
 *
 * O envio direto responde 200. A fila marca `dapi_http_5xx`. Aqui se cria UM
 * envio real na fila e se espera o cron, para ler o status verdadeiro.
 *
 * GET /backend/v1/check/fila-teste
 */
routerAdd(
  'GET',
  '/backend/v1/check/fila-teste',
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
    if (!cx) return e.json(200, { ok: false, erro: 'sem vendedor' })

    // cria envio na fila
    var envId = ''
    try {
      const env = new Record(app.findCollectionByNameOrId('whatsapp_envios'))
      env.set('conexao', cx.id)
      env.set('destino_telefone', '5541999601233')
      env.set('motivo', 'teste')
      env.set('modo', 'modelo')
      env.set('modelo_nome', String(cx.get('modelo_apresentacao_vendedor') || ''))
      env.set('modelo_idioma', 'pt_BR')
      env.set('legenda', 'Anezia|Fabio')
      env.set('texto', 'teste comparativo fila')
      env.set('estado', 'pendente')
      env.set('tentativas', 0)
      env.set('dedupe_key', 'teste-cmp-' + String(new Date().getTime()))
      env.set('fixture', false)
      app.save(env)
      envId = env.id
    } catch (e1) {
      return e.json(200, { ok: false, erro: 'criar: ' + String(e1).slice(0, 130) })
    }

    out.envio = envId
    out.conexao = {
      nome: String(cx.get('nome_exibicao') || ''),
      modelo: String(cx.get('modelo_apresentacao_vendedor') || ''),
      idioma_gravado: String(cx.get('modelo_idioma') || '(vazio)'),
      session: String(cx.get('session_id') || '').slice(0, 18),
    }
    out.aviso = 'consulte /check/fila-resultado em 90 segundos'

    return e.json(200, out)
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/check/fila-resultado',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    var envs = []
    try {
      envs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        "dedupe_key~'teste-cmp-'",
        '',
        10,
        0,
      )
    } catch (e0) {}
    const out = { ok: true, itens: [] }
    for (const en of envs) {
      out.itens.push({
        estado: String(en.get('estado') || ''),
        erro: String(en.get('ultimo_erro') || '').slice(0, 160),
        tentativas: Number(en.get('tentativas') || 0),
        tem_wamid: String(en.get('wa_message_id') || '') !== '',
        modelo: String(en.get('modelo_nome') || ''),
      })
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
