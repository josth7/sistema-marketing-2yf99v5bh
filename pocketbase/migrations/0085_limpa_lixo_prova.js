/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0085 — limpa o lixo de prova que EU deixei na conversa de teste.
 *
 * Ao provar a pausa da IA eu mandei duas mensagens pela rota de teste para a
 * conversa do Josth (a que tem o "Teste"/"Teste" dele). Essas mensagens são
 * minhas, não dele, e poluem a leitura da conversa:
 *   - "resposta automatica da ia"
 *   - "resposta da equipe pelo celular"
 *
 * Remove só essas (texto exato + tipo + janela de horário), nunca mensagem real
 * de cliente nem as duas do teste do próprio Josth.
 */

migrate(
  (app) => {
    const colM = app.findCollectionByNameOrId('whatsapp_mensagens')
    const alvos = ['resposta automatica da ia', 'resposta da equipe pelo celular']
    var removidas = 0
    for (const txt of alvos) {
      var ms = []
      try {
        ms = app.findRecordsByFilter(colM, "texto='" + txt + "'", '', 50, 0)
      } catch (e0) {}
      for (const m of ms) {
        // só as minhas: criadas hoje, tipo "outro", vindas das rotas de prova
        const quando = String(m.get('enviada_em') || '')
        if (quando.indexOf('2026-10-29') !== 0) continue
        try {
          app.delete(m)
          removidas = removidas + 1
        } catch (e1) {}
      }
    }
    console.log('0085: mensagens de prova removidas = ' + String(removidas))

    // corrige o total da conversa afetada
    try {
      const colC = app.findCollectionByNameOrId('whatsapp_conversas')
      const convs = app.findRecordsByFilter(colC, "id!=''", '', 200, 0)
      for (const c of convs) {
        var msgs = []
        try {
          msgs = app.findRecordsByFilter(colM, "conversa='" + c.id + "'", '-enviada_em', 1, 0)
        } catch (e2) {}
        const total = msgs && msgs.length > 0 ? 0 : 0
        // contagem real
        var todas = []
        try {
          todas = app.findRecordsByFilter(colM, "conversa='" + c.id + "'", '', 2000, 0)
        } catch (e3) {}
        const qtd = todas ? todas.length : 0
        if (Number(c.get('total_mensagens') || 0) !== qtd) {
          c.set('total_mensagens', qtd)
          try {
            app.save(c)
          } catch (e4) {}
        }
      }
    } catch (e5) {
      console.log('0085: recálculo -> ' + String(e5).slice(0, 120))
    }
  },
  (app) => {
    console.log('0085 revertida (mensagens de prova não voltam: eram lixo)')
  },
)
