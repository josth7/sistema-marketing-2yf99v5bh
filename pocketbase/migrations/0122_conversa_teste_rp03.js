/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0122 — conversa de TESTE para provar RP-03 e RP-04 (04/11).
 *
 * A lista de proteção da SPEC-3-005 pede, em RP-03 e RP-04, uma CONVERSA DE
 * TESTE — nunca cliente real. O motor só processa `fixture=false`
 * (o filtro do cron exclui fixture de propósito), então a conversa de teste é
 * uma conversa normal em número descartável: 5541999000099.
 *
 * O número é sequencial e não existe nem como lead nem como conversa no
 * sistema (conferido antes de gravar). A mensagem de entrada é gravada AGORA,
 * dentro da janela de 30 min, para o cron enxergar.
 *
 * A conversa é removida pela 0123 depois da prova.
 */
migrate(
  (app) => {
    const TELEFONE = '5541999000099'
    const colCx = app.findCollectionByNameOrId('whatsapp_conexoes')
    const colCv = app.findCollectionByNameOrId('whatsapp_conversas')
    const colMsg = app.findCollectionByNameOrId('whatsapp_mensagens')

    var central = null
    try {
      const cxs = app.findRecordsByFilter(colCx, "papel='central' && ativo=true", '', 5, 0)
      if (cxs && cxs.length > 0) central = cxs[0]
    } catch (e0) {}
    if (!central) {
      console.log('0122: sem conexao central ativa — nada a fazer')
      return
    }

    // não pode existir conversa com esse número
    var cv = null
    try {
      const a = app.findRecordsByFilter(
        colCv,
        "conexao='" + central.id + "' && contato_telefone='" + TELEFONE + "'",
        '',
        1,
        0,
      )
      if (a && a.length > 0) cv = a[0]
    } catch (e1) {}

    if (!cv) {
      try {
        const nc = new Record(colCv)
        nc.set('conexao', central.id)
        nc.set('contato_telefone', TELEFONE)
        nc.set('contato_nome', 'Teste RP-03')
        nc.set('estado', 'triagem')
        nc.set('total_mensagens', 0)
        nc.set('fixture', false)
        app.save(nc)
        cv = nc
        console.log('0122: conversa de teste criada (' + nc.id + ')')
      } catch (e2) {
        console.log('0122: falhou criar conversa -> ' + String(e2).slice(0, 200))
        return
      }
    } else {
      try {
        cv.set('estado', 'triagem')
        cv.set('etapa_atual', '')
        cv.set('ultima_resposta_ia_em', '')
        app.save(cv)
      } catch (e3) {}
    }

    // mensagem de entrada AGORA (dentro da janela de 30 min)
    try {
      const msg = new Record(colMsg)
      msg.set('conexao', central.id)
      msg.set('contato_telefone', TELEFONE)
      msg.set('direcao', 'entrada')
      msg.set('autor', 'cliente')
      msg.set('tipo', 'text')
      msg.set('texto', 'Ola, vi o anuncio da Haisan no Google e queria saber mais')
      msg.set('status', 'recebida')
      msg.set('enviada_em', new Date().toISOString())
      msg.set('wa_message_id', 'teste-rp03-' + String(new Date().getTime()))
      msg.set('fixture', false)
      app.save(msg)
      console.log('0122: mensagem de entrada gravada')
    } catch (e4) {
      console.log('0122: falhou gravar mensagem -> ' + String(e4).slice(0, 200))
    }

    console.log('0122: pronto — conversa=' + cv.id + ' telefone=' + TELEFONE)
  },
  (app) => {
    console.log('0122 revertida (limpeza pela 0123)')
  },
)
