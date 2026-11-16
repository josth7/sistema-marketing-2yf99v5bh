/// <reference path="../pb_data/types.d.ts" />
// Cria UM envio de apresentacao na fila e mostra o erro exato que ela grava
routerAdd(
  'GET',
  '/backend/v1/check/ft3',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true }
    var cx = null
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='vendedor' && ativo=true && fixture=false && apresentacao_ativa=true",
      '',
      1,
      0,
    ))
      cx = c
    if (!cx) return e.json(200, { ok: false, erro: 'sem vendedor' })
    const chaveUX = String(cx.get('dedupe_key_unica') || '')
    try {
      const env = new Record(app.findCollectionByNameOrId('whatsapp_envios'))
      env.set('conexao', cx.id)
      env.set('destino_telefone', '5541999601233')
      env.set('motivo', 'apresentacao_vendedor')
      env.set('modo', 'modelo')
      env.set('modelo_nome', String(cx.get('modelo_apresentacao_vendedor') || ''))
      env.set('legenda', 'Teste Fila 2|Fábio Teles')
      env.set('texto', 'teste fila 16/11 b')
      env.set('estado', 'pendente')
      env.set('tentativas', 0)
      env.set('fixture', false)
      env.set('dedupe_key', 'ft3-' + String(new Date().getTime()))
      app.save(env)
      out.criado = env.id
    } catch (e1) {
      out.erro = String(e1).slice(0, 160)
      return e.json(200, out)
    }
    // le de volta o resultado
    const lst = []
    for (const x of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "dedupe_key~'ft3-'",
      '',
      5,
      0,
    ))
      lst.push({
        est: String(x.get('estado')),
        erro: String(x.get('ultimo_erro') || ''),
        tent: Number(x.get('tentativas') || 0),
        leg: String(x.get('legenda') || ''),
        wamid: String(x.get('wa_message_id') || '') !== '',
      })
    out.resultado = lst
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
