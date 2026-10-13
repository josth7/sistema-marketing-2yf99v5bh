/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0019 — campo aditivo em `reports` (SPEC-2-004, card a70d5ab8, CA-2-11).
 *
 * idempotency_key: replay da MESMA solicitação administrativa devolve a MESMA revisão
 * (não cria uma 3ª). Chaves diferentes → revisões distintas auditadas (SPEC).
 *
 * ADITIVA: campo novo + índice; nenhum campo existente muda; down remove só o novo.
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('reports')
    try {
      col.fields.getByName('idempotency_key')
      console.log('migração 0019: campo já existe — nada a fazer')
      return
    } catch (_) {
      // campo não existe — adicionar (AP-2026-10-07-1420: fields.add EXIGE construtor tipado)
      col.fields.add(new TextField({ name: 'idempotency_key', max: 64 }))
      app.save(col)
    }
    try {
      app
        .db()
        .newQuery('CREATE INDEX IF NOT EXISTS idx_reports_idemp ON reports (idempotency_key)')
        .execute()
    } catch (e) {
      console.log('migração 0019: índice já existe ou falhou: ' + String(e).slice(0, 120))
    }
    console.log('migração 0019 aplicada: reports.idempotency_key (aditiva)')
  },
  (app) => {
    try {
      const col = app.findCollectionByNameOrId('reports')
      col.fields.removeByName('idempotency_key')
      app.save(col)
    } catch (e) {}
    console.log('migração 0019 revertida')
  },
)
