/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/prova-saida',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true }
    // 1. cria um envio de texto para o meu numero na central
    var central = null
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true && fixture=false",
      '',
      1,
      0,
    ))
      central = c
    if (!central) return e.json(200, { ok: false })
    const tel = '5541999601233'
    try {
      const env = new Record(app.findCollectionByNameOrId('whatsapp_envios'))
      env.set('conexao', central.id)
      env.set('destino_telefone', tel)
      env.set('motivo', 'ia_resposta')
      env.set('modo', 'texto')
      env.set('texto', 'PROVA da gravacao no historico 16/11')
      env.set('legenda', '')
      env.set('estado', 'pendente')
      env.set('tentativas', 0)
      env.set('fixture', false)
      env.set('dedupe_key', 'prova-saida-' + String(new Date().getTime()))
      app.save(env)
      out.criado = env.id
    } catch (e1) {
      out.erro = String(e1).slice(0, 140)
    }
    // 2. quantas saidas no historico da central agora?
    const s = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "conexao='" + central.id + "' && direcao='saida' && created>='2026-11-16 00:00'",
      '',
      100,
      0,
    )
    out.saidas_hoje = s.length
    const amostra = []
    for (const x of s)
      amostra.push(
        String(x.get('created') || '').slice(11, 19) +
          ' ' +
          String(x.get('autor') || '') +
          ' ' +
          String(x.get('texto') || '').slice(0, 30),
      )
    amostra.sort()
    out.amostra = amostra.slice(-3)
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
