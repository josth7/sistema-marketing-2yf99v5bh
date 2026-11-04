/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0124 — prova do envio por número de vendedor (04/11).
 *
 * A configuração mudou: as 4 chaves por sessão foram gravadas no cofre e
 * todas as conexões passaram a mostrar `segredo_configurado: true`.
 *
 * Falta a única prova que importa: **a mensagem sai pelo número do vendedor?**
 * Esta migração cria uma conversa de teste em número descartável
 * (5541999000088) e um envio na fila com motivo `vendedor_resposta` atribuído
 * à conexão do Fábio. A fila pega em até 2 minutos.
 *
 * O destino é o número de TESTE — nunca cliente. Limpeza na 0125.
 */
migrate(
  (app) => {
    const TELEFONE = '5541999000088'
    const colCx = app.findCollectionByNameOrId('whatsapp_conexoes')
    const colCv = app.findCollectionByNameOrId('whatsapp_conversas')
    const colMsg = app.findCollectionByNameOrId('whatsapp_mensagens')
    const colEnv = app.findCollectionByNameOrId('whatsapp_envios')

    // conexão do Fábio
    var fabio = null
    try {
      const a = app.findRecordsByFilter(
        colCx,
        "papel='vendedor' && nome_exibicao='Fábio Teles'",
        '',
        1,
        0,
      )
      if (a && a.length > 0) fabio = a[0]
    } catch (e0) {}
    if (!fabio) {
      try {
        const b = app.findRecordsByFilter(colCx, "papel='vendedor'", '', 5, 0)
        if (b && b.length > 0) fabio = b[0]
      } catch (e1) {}
    }
    if (!fabio) {
      console.log('0124: sem conexao de vendedor — nada a fazer')
      return
    }

    // conversa de teste (entrada do "cliente" primeiro)
    var cv = null
    try {
      const a = app.findRecordsByFilter(
        colCv,
        "conexao='" + fabio.id + "' && contato_telefone='" + TELEFONE + "'",
        '',
        1,
        0,
      )
      if (a && a.length > 0) cv = a[0]
    } catch (e2) {}
    if (!cv) {
      try {
        const nc = new Record(colCv)
        nc.set('conexao', fabio.id)
        nc.set('contato_telefone', TELEFONE)
        nc.set('contato_nome', 'Teste RP-05')
        nc.set('estado', 'pausada_humano')
        nc.set('total_mensagens', 0)
        nc.set('fixture', false)
        app.save(nc)
        cv = nc
      } catch (e3) {
        console.log('0124: falhou conversa -> ' + String(e3).slice(0, 160))
        return
      }
    }

    // mensagem do "cliente" (contexto)
    try {
      const m = new Record(colMsg)
      m.set('conexao', fabio.id)
      m.set('contato_telefone', TELEFONE)
      m.set('direcao', 'entrada')
      m.set('autor', 'cliente')
      m.set('tipo', 'text')
      m.set('texto', 'Oi, queria saber o prazo da poltrona')
      m.set('status', 'recebida')
      m.set('enviada_em', new Date().toISOString())
      m.set('wa_message_id', 'teste-rp05-ent-' + String(new Date().getTime()))
      m.set('fixture', false)
      app.save(m)
    } catch (e4) {}

    // envio na fila, pelo número do vendedor
    try {
      const env = new Record(colEnv)
      env.set('conexao', fabio.id)
      env.set('destino_telefone', TELEFONE)
      env.set('motivo', 'vendedor_resposta')
      env.set('modo', 'texto')
      env.set(
        'texto',
        'Teste RP-05: resposta do vendedor pelo sistema Haisan. Se chegou, o numero do vendedor esta enviando.',
      )
      env.set('legenda', '')
      env.set('autor_user', '')
      env.set('criado_por', '')
      env.set('estado', 'pendente')
      env.set('tentativas', 0)
      env.set('fixture', false)
      env.set('dedupe_key', 'teste-rp05-' + String(new Date().getTime()))
      app.save(env)
      console.log('0124: envio na fila pela conexao ' + String(fabio.get('nome_exibicao')))
    } catch (e5) {
      console.log('0124: falhou envio -> ' + String(e5).slice(0, 200))
    }
  },
  (app) => {
    console.log('0124 revertida')
  },
)
