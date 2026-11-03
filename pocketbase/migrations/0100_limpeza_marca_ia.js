/// <reference path="../pb_data/types.d.ts" />
// ===================================================================
// LIMPEZA 03/11 (parte 2) — a marca de "ja respondi" e falsa.
//
// A mig 0099 limpou `etapa_atual`, mas o ensaio tambem gravou
// `ultima_resposta_ia_em` em conversas onde NENHUMA resposta saiu (o envio
// estava desligado). Com essa marca no futuro, o cron conclui "ja respondi
// esta mensagem" e pula — a conversa nunca e atendida (03/11).
//
// Criterio seguro: limpa `ultima_resposta_ia_em` das conversas em que NAO
// existe envio `ia_roteiro` — ou seja, nada saiu pelo motor. Nao toca em
// conversa com resposta real.
// ===================================================================
migrate(
  (app) => {
    const colCv = app.findCollectionByNameOrId('whatsapp_conversas')
    const colEnv = app.findCollectionByNameOrId('whatsapp_envios')

    // existe algum envio do motor? (ia_roteiro nunca foi criado — ensaio)
    var temEnvioMotor = false
    try {
      const envs = app.findRecordsByFilter(colEnv, "motivo='ia_roteiro'", '', 1, 0)
      if (envs && envs.length > 0) temEnvioMotor = true
    } catch (e0) {}

    if (temEnvioMotor) {
      // se algum dia houver envio real do motor, esta limpeza nao se aplica
      console.log('limpeza_marca_ia: existem envios ia_roteiro — nada a limpar')
      return
    }

    var todas = []
    try {
      todas = app.findRecordsByFilter(colCv, '', '', 500, 0)
    } catch (e1) {
      console.log('limpeza_marca_ia: nao consegui listar: ' + e1)
      return
    }
    var limpas = 0
    for (const cv of todas) {
      const marca = String(cv.get('ultima_resposta_ia_em') || '')
      if (marca === '') continue
      cv.set('ultima_resposta_ia_em', '')
      try {
        app.save(cv)
        limpas++
      } catch (e2) {}
    }
    console.log('limpeza_marca_ia: ' + limpas + ' conversa(s) sem marca falsa de resposta')
  },
  (app) => {
    // reversivel: a marca era falsa, nao havia resposta a restaurar
  },
)
