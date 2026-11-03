/// <reference path="../pb_data/types.d.ts" />
// ===================================================================
// LIMPEZA 03/11 — desfaz o estrago do modo ensaio.
//
// O cron gravou `etapa_atual` em conversas REAIS sem enviar nenhuma resposta
// (corrigido na ref ff926f7). Resultado: 9 conversas ficaram com a etapa
// adiantada — a IA "achava" que ja tinha perguntado coisas que o cliente
// nunca viu.
//
// Regra da limpeza: toda conversa cujo `ultima_resposta_ia_em` e ANTERIOR a
// hoje 03/11 11:00 NAO teve resposta nossa pelo motor; logo a etapa dela e
// suspeita. Volta para '' (recomeca o roteiro do menu) — o cliente recebe o
// menu de novo, que e o correto para quem nunca foi respondido.
//
// Nao apaga nada, nao mexe em conversa com resposta real da IA.
// ===================================================================
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('whatsapp_conversas')
    const corte = '2026-11-03 11:00:00.000Z'
    var todas = []
    try {
      todas = app.findRecordsByFilter(col, '', '', 500, 0)
    } catch (e0) {
      console.log('limpeza_etapa_ensaio: nao consegui listar: ' + e0)
      return
    }
    var limpas = 0
    for (const cv of todas) {
      const etapa = String(cv.get('etapa_atual') || '')
      if (etapa === '') continue
      const iaEm = String(cv.get('ultima_resposta_ia_em') || '')
      // conversa que nunca recebeu resposta do motor: etapa e lixo do ensaio
      if (iaEm === '' || iaEm < corte) {
        cv.set('etapa_atual', '')
        try {
          app.save(cv)
          limpas++
        } catch (e1) {}
      }
    }
    console.log('limpeza_etapa_ensaio: ' + limpas + ' conversa(s) voltaram ao inicio')
  },
  (app) => {
    // reversivel: nada a desfazer (o estado anterior era lixo de ensaio)
  },
)
