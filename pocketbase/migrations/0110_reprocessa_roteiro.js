/// <reference path="../pb_data/types.d.ts" />
// ===================================================================
// MIG 0110 — DEVOLVE AO ROBÔ AS CONVERSAS "RESPONDIDAS" SEM ENVIO (04/11).
//
// Ao ligar o robô (v0.0.433), o envio era recusado pela coleção
// whatsapp_envios (motivo 'ia_roteiro' não existe no select) e o catch vazio
// escondia. O robô marcou `ultima_resposta_ia_em` e avançou a etapa, mas
// nenhuma mensagem saiu. Esta migração volta essas conversas ao estado de
// antes, para o robô responder de novo (dentro da janela de 30 minutos).
//
// Só conversas marcadas pelo robô a partir de 04/11 13:12 UTC e sem envio da
// IA na fila. Não envia mensagem, não apaga nada.
// ===================================================================
migrate(
  (app) => {
    const colCv = app.findCollectionByNameOrId('whatsapp_conversas')
    const colEnv = app.findCollectionByNameOrId('whatsapp_envios')
    var conversas = []
    try {
      conversas = app.findRecordsByFilter(
        colCv,
        "ultima_resposta_ia_em != '' && fixture=false",
        '',
        200,
        0,
      )
    } catch (e0) {
      conversas = []
    }
    var n = 0
    for (const cv of conversas) {
      const marca = String(cv.get('ultima_resposta_ia_em') || '').replace('T', ' ')
      if (marca < '2026-11-04 13:12:00') continue
      var temEnvio = false
      try {
        const envs = app.findRecordsByFilter(
          colEnv,
          "dedupe_key ~ 'iarot-" + cv.id + "-'",
          '',
          1,
          0,
        )
        temEnvio = envs && envs.length > 0
      } catch (e1) {}
      if (temEnvio) continue
      cv.set('ultima_resposta_ia_em', '')
      if (String(cv.get('etapa_atual') || '') === 'menu') cv.set('etapa_atual', '')
      try {
        app.save(cv)
        n++
      } catch (e2) {}
    }
    console.log('0110: conversas devolvidas ao robo = ' + n)
  },
  (app) => {},
)
