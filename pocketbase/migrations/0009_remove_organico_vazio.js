/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0009 — remove a linha orgânica vazia (RN-06, task 462da177).
 *
 * Registro "Orgânico — Haisan" (meta_ads, natureza=organico, 06/10) gravado com
 * gasto 0 / impressões 0 / cliques 0: a API responde 200 mas sem métrica real
 * (>0) no período — RN-06 manda NÃO gravar (ausência ≠ zero falso). Resquício
 * da ingestão de 16:59; o filtro do hook impede novos, este limpa o existente.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('metricas_diarias')
    const filtro = "canal='meta_ads' && natureza='organico' && data='2026-10-06 00:00:00.000Z'"
    const registros = app.findRecordsByFilter(col, filtro, '', 10, 0)
    for (const r of registros) {
      const impr = r.get('impressoes') ?? 0
      const cliq = r.get('cliques') ?? 0
      const gasto = r.get('gasto') ?? 0
      if (impr === 0 && cliq === 0 && gasto === 0) {
        app.delete(r)
      }
    }
  },
  (app) => {
    // Down: nada a restaurar — registro sem métrica real não deveria existir.
  },
)
