/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0019 — campo aditivo em `reports` (SPEC-2-004, card a70d5ab8, CA-2-11).
 *
 * idempotency_key: replay da MESMA solicitação administrativa devolve a MESMA revisão
 * (não cria uma 3ª). Chaves diferentes → revisões distintas auditadas (SPEC).
 * A deduplicação é aplicada pela ROTA (consulta por chave antes de criar) — o índice
 * SQL cru foi dispensado de propósito: app.db() cru é API instável no JSVM e a rota
 * já cobre o caso de replay (chamadas repetidas depois da primeira conclusão).
 *
 * ADITIVA: campo novo; nenhum campo existente muda; down remove só o campo.
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
    console.log('migração 0019 aplicada: reports.idempotency_key (aditiva, dedupe na rota)')
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
