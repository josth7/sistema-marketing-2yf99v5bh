/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0126 — prova do envio pelos 3 vendedores restantes (04/11).
 *
 * Já provei o Fábio (0124, saiu `enviado`). Faltam Douglas, Elisangela e
 * Adriana: cada conexão tem o próprio `nome_segredo_chave` e a própria
 * `apiKey`, então "configurado" não basta — tem de sair pelo número de cada um.
 *
 * Para cada vendedor: cria a conversa de teste no número descartável, grava a
 * entrada do "cliente" e põe na fila um `vendedor_resposta` atribuído à
 * conexão DELE. A fila pega em até 2 minutos.
 *
 * Destinos de teste (não existem como lead nem como conversa):
 *   Douglas     -> 5541999000077
 *   Elisangela  -> 5541999000066
 *   Adriana     -> 5541999000055
 *
 * Limpeza na 0127.
 */
migrate(
  (app) => {
    const colCx = app.findCollectionByNameOrId('whatsapp_conexoes')
    const colCv = app.findCollectionByNameOrId('whatsapp_conversas')
    const colMsg = app.findCollectionByNameOrId('whatsapp_mensagens')
    const colEnv = app.findCollectionByNameOrId('whatsapp_envios')

    const alvos = [
      { nome: 'Douglas Renato', tel: '5541999000077' },
      { nome: 'Elisangela Silva', tel: '5541999000066' },
      { nome: 'Adriana Santos', tel: '5541999000055' },
    ]

    for (const a of alvos) {
      // acha a conexão pelo nome
      var cx = null
      try {
        const r = app.findRecordsByFilter(
          colCx,
          "papel='vendedor' && nome_exibicao='" + a.nome + "'",
          '',
          1,
          0,
        )
        if (r && r.length > 0) cx = r[0]
      } catch (e0) {}
      if (!cx) {
        console.log('0126: conexao nao encontrada -> ' + a.nome)
        continue
      }
      if (String(cx.get('segredo_configurado')) !== 'true') {
        // o campo é bool; se vier false, registra e segue (a prova dirá)
        if (cx.get('segredo_configurado') !== true) {
          console.log('0126: AVISO sem segredo -> ' + a.nome)
        }
      }

      // conversa
      var cv = null
      try {
        const r = app.findRecordsByFilter(
          colCv,
          "conexao='" + cx.id + "' && contato_telefone='" + a.tel + "'",
          '',
          1,
          0,
        )
        if (r && r.length > 0) cv = r[0]
      } catch (e1) {}
      if (!cv) {
        try {
          const nc = new Record(colCv)
          nc.set('conexao', cx.id)
          nc.set('contato_telefone', a.tel)
          nc.set('contato_nome', 'Teste vendedor')
          nc.set('estado', 'pausada_humano')
          nc.set('total_mensagens', 0)
          nc.set('fixture', false)
          app.save(nc)
          cv = nc
        } catch (e2) {
          console.log('0126: falhou conversa ' + a.nome + ' -> ' + String(e2).slice(0, 120))
          continue
        }
      }

      // mensagem do "cliente"
      try {
        const m = new Record(colMsg)
        m.set('conexao', cx.id)
        m.set('contato_telefone', a.tel)
        m.set('direcao', 'entrada')
        m.set('autor', 'cliente')
        m.set('tipo', 'text')
        m.set('texto', 'Teste de envio pelo numero do vendedor')
        m.set('status', 'recebida')
        m.set('enviada_em', new Date().toISOString())
        m.set('wa_message_id', 'teste-vend-' + String(new Date().getTime()) + '-' + a.tel.slice(-3))
        m.set('fixture', false)
        app.save(m)
      } catch (e3) {}

      // envio na fila pela conexão do vendedor
      try {
        const env = new Record(colEnv)
        env.set('conexao', cx.id)
        env.set('destino_telefone', a.tel)
        env.set('motivo', 'vendedor_resposta')
        env.set('modo', 'texto')
        env.set(
          'texto',
          'Teste: envio pelo numero do vendedor (' +
            a.nome +
            '). Se chegou, a chave deste numero funciona.',
        )
        env.set('legenda', '')
        env.set('autor_user', '')
        env.set('criado_por', '')
        env.set('estado', 'pendente')
        env.set('tentativas', 0)
        env.set('fixture', false)
        env.set('dedupe_key', 'teste-vend-' + a.tel.slice(-3) + '-' + String(new Date().getTime()))
        app.save(env)
        console.log('0126: envio na fila -> ' + a.nome + ' (' + a.tel + ')')
      } catch (e4) {
        console.log('0126: falhou envio ' + a.nome + ' -> ' + String(e4).slice(0, 160))
      }
    }
    console.log('0126: pronto')
  },
  (app) => {
    console.log('0126 revertida (limpeza na 0127)')
  },
)
