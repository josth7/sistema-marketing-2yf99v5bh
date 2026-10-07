/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0011 — remove linha orgânica vazia de 07/10 (RN-06, card b327b4ea).
 *
 * O job diário da Meta gravou a linha orgânica de 07/10 com gasto 0 / impressões 0
 * / cliques 0 (sem métrica real >0). RN-06: ausência ≠ zero falso — não gravar.
 * O hook da rota já tem o filtro; o job diário será alinhado em correção própria.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('metricas_diarias')
    const filtro = "natureza='organico' && data='2026-10-07 00:00:00.000Z'"
    const registros = app.findRecordsByFilter(col, filtro, '', 10, 0)
    for (const r of registros) {
      const impr = r.get('impressoes') ?? 0
      const cliq = r.get('cliques') ?? 0
      const gasto = r.get('gasto') ?? 0
      const alc = r.get('alcance') ?? 0
      if (impr === 0 && cliq === 0 && gasto === 0 && alc === 0) {
        app.delete(r)
      }
    }
  },
  (app) => {
    // Down: nada a restaurar — registro sem métrica real não deveria existir.
  },
)
