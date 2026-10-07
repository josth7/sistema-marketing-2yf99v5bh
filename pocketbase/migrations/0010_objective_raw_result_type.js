/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0010 — campos objective_raw e result_type (card b327b4ea, CA-2-01/02).
 *
 * A conversão do painel rejeitava os códigos raw da Meta (OUTCOME_AWARENESS,
 * LINK_CLICKS, OUTCOME_LEADS) e tudo caía em "Não informado", onde resultados
 * de tipos distintos eram somados e o CPR era calculado sobre objetivos
 * incompatíveis (validação 07/10: CPR 49,54 falso).
 *
 * - objective_raw: código original da fonte (nunca descartar o que a API manda)
 * - result_type: tipo do resultado (Google = 'conversoes' via all_conversions;
 *   Meta = null explícito — a API de insights lida não fornece tipo separado)
 *
 * Backfill reversível e sem apagar métricas:
 * - objective_raw = valor atual de objetivo (que É o raw gravado pelo hook)
 * - result_type = 'conversoes' nos registros Google com resultados > 0
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('metricas_diarias')
    // Up: adicionar campos se não existirem (idempotente por nome)
    const temRaw = col.fields.some((f) => f.name === 'objective_raw')
    const temTipo = col.fields.some((f) => f.name === 'result_type')
    if (!temRaw) {
      col.fields.add({
        name: 'objective_raw',
        type: 'text',
        required: false,
        presentable: false,
      })
    }
    if (!temTipo) {
      col.fields.add({
        name: 'result_type',
        type: 'text',
        required: false,
        presentable: false,
      })
    }
    app.save(col)

    // Backfill: objective_raw = objetivo atual (o hook grava o raw); result_type
    // do Google = 'conversoes' (all_conversions). Meta: null (sem tipo na fonte).
    const registros = app.findRecordsByFilter(col, "origem='api'", '', 500, 0)
    for (const r of registros) {
      const canal = r.get('canal')
      const objetivo = r.get('objetivo') || ''
      if (!r.get('objective_raw')) r.set('objective_raw', objetivo)
      if (canal === 'google_ads' && !r.get('result_type')) {
        r.set('result_type', 'conversoes')
      }
      app.save(r)
    }
  },
  (app) => {
    // Down: remover os campos (dados de backfill descartáveis — recriáveis
    // re-executando o up; métricas reais nunca são tocadas)
    const col = app.findCollectionByNameOrId('metricas_diarias')
    const campos = ['objective_raw', 'result_type']
    for (const nome of campos) {
      const f = col.fields.find((x) => x.name === nome)
      if (f) col.fields.remove(f)
    }
    app.save(col)
  },
)
