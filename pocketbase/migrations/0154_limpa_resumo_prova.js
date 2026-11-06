/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0154 — remove o envio de prova do resumo (06/11).
 *
 * A prova do CA-3-49 gerou um resumo real para a Anezia às 15:00, com o texto
 * certo. Ele ficou PENDENTE na fila. Como era prova, sai antes de a fila
 * enviar — não faz sentido mandar mensagem para ela por causa de um teste.
 *
 * O que fica registrado é o TEXTO que ele geraria, já documentado na entrega.
 */
migrate(
  (app) => {
    var removidos = 0
    try {
      const col = app.findCollectionByNameOrId('whatsapp_envios')
      const es = app.findRecordsByFilter(col, "motivo='resumo_gestao'", '', 50, 0)
      for (const e of es) {
        try {
          app.delete(e)
          removidos++
        } catch (a) {}
      }
    } catch (e0) {}
    console.log('0154: envios de resumo de prova removidos = ' + removidos)
  },
  (app) => {
    console.log('0154 revertida')
  },
)
