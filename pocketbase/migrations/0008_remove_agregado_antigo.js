/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0008 — remove o registro agregado antigo do Google (task 462da177).
 *
 * A carga histórica (migração 0005) gravou o Google com janela de 30 dias
 * (LAST_30_DAYS) como se fosse um dia: campanha 24271004293
 * (MOVIENARI | 00 - Inscrições YouTube) em 30/09 com 18.523 impressões /
 * R$ 415,58. Com a leitura diária nova (E-12), esse registro polui o painel:
 * soma gasto de 30 dias na data 30/09 e duplica a campanha com métricas
 * incompatíveis de granularidade.
 *
 * Critério (registrado no changelog da demo): apagar SOMENTE esse registro
 * agregado — os dados diários reais (fonte+conta+campanha+dia) ficam intactos.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('metricas_diarias')
    const filtro =
      "canal='google_ads' && campanha_id='24271004293' && data='2026-09-30 00:00:00.000Z'"
    const registros = app.findRecordsByFilter(col, filtro, '', 10, 0)
    for (const r of registros) {
      // Só apaga o agregado: janela de 30 dias tem impressões >> dia único
      const impr = r.get('impressoes') ?? 0
      if (impr > 10000) {
        app.delete(r)
      }
    }
  },
  (app) => {
    // Down: nada a restaurar — o registro era agregado de uma carga antiga
    // (recriável re-executando a carga 0005 se necessário).
  },
)
