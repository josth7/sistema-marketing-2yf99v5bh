/// <reference path="../pb_data/types.d.ts" />
// EXECUTA a lógica do roteiro para a conversa travada e GRAVA (teste controlado)
routerAdd(
  'GET',
  '/backend/v1/check/executa-etapa',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const ex = String(e.request.url.query().get('executar') || '') === '1'
    const out = { ok: true, executar: ex, resultado: '' }
    const cvs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conversas'),
      "contato_telefone~'9036170'",
      '',
      10,
      0,
    )
    const centrais = {}
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true && fixture=false",
      '',
      5,
      0,
    ))
      centrais[c.id] = c
    var alvo = null
    for (const c of cvs) if (centrais[String(c.get('conexao') || '')]) alvo = c
    if (!alvo) return e.json(200, { ok: false })
    // o que o codigo decidiria para etapaAtual=e3b e texto="2"
    out.etapa_atual = String(alvo.get('etapa_atual') || '')
    // simula: "2" nao tem 'ja sou'/'sou cliente'/'sim' -> vai para e3c
    const txt = '2'
    const ehCliente = ['ja sou', 'sou cliente', 'cliente haisan', 'ja comprei', 'sim'].some(
      function (k) {
        return txt.indexOf(k) >= 0
      },
    )
    out.decisao = ehCliente ? 'e5 (ja_e_cliente)' : 'e3c (confirmar_necessidade)'
    if (ex && !ehCliente) {
      // aplica a etapa e enfileira a resposta, como o cron faria
      try {
        alvo.set('etapa_atual', 'e3c')
        app.save(alvo)
        const env = new Record(app.findCollectionByNameOrId('whatsapp_envios'))
        env.set('lead', String(alvo.get('lead') || ''))
        env.set('conexao', String(alvo.get('conexao')))
        env.set('destino_telefone', String(alvo.get('contato_telefone')))
        env.set('motivo', 'ia_resposta')
        env.set('modo', 'texto')
        env.set(
          'texto',
          'Perfeito! 😊 Para eu te passar a pessoa certa, me conta: você precisa de *poltrona/cadeira*, *lavatório*, *maca*, *móvel para manicure* ou *espelho e recepção*?',
        )
        env.set('legenda', '')
        env.set('estado', 'pendente')
        env.set('tentativas', 0)
        env.set('fixture', false)
        env.set('dedupe_key', 'manual-e3c-' + String(new Date().getTime()))
        app.save(env)
        out.resultado = 'etapa e3c aplicada + resposta enfileirada'
        out.envio = env.id
      } catch (e1) {
        out.erro = String(e1).slice(0, 120)
      }
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
