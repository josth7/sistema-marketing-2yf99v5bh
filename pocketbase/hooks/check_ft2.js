/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/fila-teste2',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true }
    // cria UM envio de apresentacao com legenda real e deixa a fila processar
    var cx = null
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='vendedor' && ativo=true && fixture=false && apresentacao_ativa=true",
      '',
      1,
      0,
    ))
      cx = c
    if (!cx) return e.json(200, { ok: false })
    try {
      const env = new Record(app.findCollectionByNameOrId('whatsapp_envios'))
      env.set('conexao', cx.id)
      env.set('destino_telefone', '5541999601233')
      env.set('motivo', 'apresentacao_vendedor')
      env.set('modo', 'modelo')
      env.set('modelo_nome', String(cx.get('modelo_apresentacao_vendedor') || ''))
      env.set('legenda', 'Teste Fila|Fábio Teles')
      env.set('texto', 'teste da fila 16/11')
      env.set('estado', 'pendente')
      env.set('tentativas', 0)
      env.set('fixture', false)
      env.set('dedupe_key', 'teste-fila-16-' + String(new Date().getTime()))
      app.save(env)
      out.envio = env.id
      out.aviso = 'aguarde 1-2 min e consulte /check/fila-resultado2'
    } catch (e1) {
      out.erro = String(e1).slice(0, 140)
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/check/fila-resultado2',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, itens: [] }
    for (const x of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "dedupe_key~'teste-fila-16-'",
      '',
      5,
      0,
    )) {
      out.itens.push({
        est: String(x.get('estado')),
        erro: String(x.get('ultimo_erro') || '').slice(0, 60),
        tent: Number(x.get('tentativas') || 0),
        leg: String(x.get('legenda') || '').slice(0, 25),
        wamid: String(x.get('wa_message_id') || '') !== '',
      })
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
