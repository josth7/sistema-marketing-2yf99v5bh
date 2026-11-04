/// <reference path="../pb_data/types.d.ts" />
/**
 * TESTE DO ATENDIMENTO (04/11) — o robô atende um cliente que escreve AGORA?
 *
 * O dono diz que não está tendo atendimento. Já descobri que o robô atendeu 4
 * clientes hoje de manhã e depois parou. Para saber onde quebra, esta rota
 * simula a entrada de uma mensagem de cliente AGORA (dentro da janela) e
 * informa o que o motor faria — sem enviar nada para fora.
 *
 * GET  /backend/v1/diag/teste-atendimento        → mostra a decisão
 * POST /backend/v1/diag/teste-atendimento        → grava a mensagem de entrada
 *                                                  e deixa o cron decidir
 */
routerAdd(
  'POST',
  '/backend/v1/diag/teste-atendimento',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'sem sessão' })

    const app = $app
    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}

    const texto = String(body.texto || 'Olá! Vi o anúncio da Haisan e quero informações')
    const telefone = String(body.telefone || '5541999000001').replace(/\D/g, '')

    // ---------- conexão central real ----------
    var central = null
    try {
      const cxs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true",
        '',
        5,
        0,
      )
      if (cxs.length > 0) central = cxs[0]
    } catch (e0) {}
    if (!central) return e.json(422, { ok: false, erro: 'sem central ativa' })

    const agora = new Date().toISOString()

    // ---------- conversa: cria ou reusa ----------
    var conversa = null
    try {
      const achadas = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "conexao='" + central.id + "' && contato_telefone='" + telefone + "'",
        '',
        1,
        0,
      )
      if (achadas.length > 0) conversa = achadas[0]
    } catch (e1) {}

    if (!conversa) {
      const nc = new Record(app.findCollectionByNameOrId('whatsapp_conversas'))
      nc.set('conexao', central.id)
      nc.set('contato_telefone', telefone)
      nc.set('contato_nome', 'Teste Atendimento')
      nc.set('estado', 'triagem')
      nc.set('total_mensagens', 0)
      nc.set('fixture', false)
      app.save(nc)
      conversa = nc
    } else {
      conversa.set('estado', 'triagem')
      conversa.set('etapa_atual', '')
      conversa.set('ultima_resposta_ia_em', '')
      app.save(conversa)
    }

    // ---------- mensagem de ENTRADA agora ----------
    const msg = new Record(app.findCollectionByNameOrId('whatsapp_mensagens'))
    msg.set('conexao', central.id)
    msg.set('contato_telefone', telefone)
    msg.set('direcao', 'entrada')
    msg.set('autor', 'cliente')
    msg.set('tipo', 'text')
    msg.set('texto', texto)
    msg.set('status', 'recebida')
    msg.set('enviada_em', agora)
    msg.set('wa_message_id', 'teste-atend-' + String(new Date().getTime()))
    msg.set('fixture', false)
    app.save(msg)

    return e.json(200, {
      ok: true,
      conversa: conversa.id,
      telefone: telefone,
      mensagem_em: agora,
      aviso:
        'Mensagem de entrada gravada. O cron roda a cada minuto — em até 60s ' +
        'ele deve decidir e enfileirar a resposta. Confira em /diag/esperando ' +
        'e na fila de envios.',
    })
  },
  $apis.requireAuth(),
)
