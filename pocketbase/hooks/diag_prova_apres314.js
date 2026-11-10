/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA DA APRESENTAÇÃO (10/11) — CA-3-114.
 *
 * Envia o modelo de apresentação pelo número do **Fábio** (religado agora, com
 * autorização do dono) para um **número interno da equipe** — a Anezia.
 *
 * **Não vai para cliente.** O destino é interno.
 *
 * Mostra: status da D-API, `wamid` e a hora. A entrega real (`message.delivered`)
 * chega depois pelo webhook.
 *
 * GET /backend/v1/diag/prova-apres-ca314
 */
routerAdd(
  'GET',
  '/backend/v1/diag/prova-apres-ca314',
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
    if (!cx) return e.json(200, { ok: false, erro: 'nenhum número com apresentação ligada' })

    out.numero = String(cx.get('nome_exibicao') || '')
    out.modelo = String(cx.get('modelo_apresentacao_vendedor') || '')

    // cria o envio na fila (o mesmo caminho do cron)
    const colEnv = app.findCollectionByNameOrId('whatsapp_envios')
    var envId = ''
    try {
      const env = new Record(colEnv)
      env.set('conexao', cx.id)
      env.set('destino_telefone', '5541999601233')
      env.set('motivo', 'teste')
      env.set('modo', 'modelo')
      env.set('modelo_nome', out.modelo)
      env.set('legenda', 'Anezia|Fabio')
      env.set('texto', 'prova da apresentacao CA-3-114')
      env.set('estado', 'pendente')
      env.set('tentativas', 0)
      env.set('dedupe_key', 'prova-apres-314-' + String(new Date().getTime()))
      env.set('fixture', false)
      app.save(env)
      envId = env.id
      out.envio = env.id
    } catch (e1) {
      return e.json(200, { ok: false, erro: 'criar envio: ' + String(e1).slice(0, 120) })
    }

    out.aviso = 'o envio esta na fila; o cron de 2 min manda e o webhook confirma'

    // relê depois de um instante? não dá para esperar aqui: devolve o id
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
