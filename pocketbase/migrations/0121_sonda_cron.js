/// <reference path="../pb_data/types.d.ts" />
/**
 * SONDA DE CRON (04/11) — os crons deste projeto rodam mesmo?
 *
 * O cron do motor está registrado (`cronAdd('wa_roteiro', '* * * * *', ...)`)
 * e não aparece em `_cron_settings`, enquanto outros 4 aparecem. A fila de
 * envios não recebe nada há horas. Antes de mexer no motor, preciso saber se
 * o agendador está funcionando neste projeto.
 *
 * Esta sonda registra um cron minúsculo que grava a hora numa coleção própria.
 * Se aparecerem registros, o agendador roda e o problema é o motor. Se não
 * aparecerem, o agendador não roda e nada que eu escreva aqui vai funcionar.
 */
migrate(
  (app) => {
    // coleção da sonda
    var existe = null
    try {
      existe = app.findCollectionByNameOrId('diag_cron_sonda')
    } catch (e0) {}
    if (!existe) {
      const col = new Collection({
        name: 'diag_cron_sonda',
        type: 'base',
        fields: [
          { name: 'job', type: 'text' },
          { name: 'quando', type: 'date' },
        ],
      })
      app.save(col)
      console.log('sonda: colecao criada')
    }
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('diag_cron_sonda'))
    } catch (e) {}
  },
)
