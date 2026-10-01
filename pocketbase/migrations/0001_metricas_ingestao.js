/**
 * Migração 0001 — coleções da ingestão (task ea514702, SPEC-1-001).
 *
 * metricas_diarias: um registro por campanha × dia × fonte (origem api/csv/demonstracao).
 *   Métrica ausente é gravada como NULL — nunca zero (RN-06).
 * fontes_estado: estado de cada fonte/canal (conectado, erro, última ingestão — RN-07).
 *
 * RLS: leitura para autenticados; escrita somente via hooks/servidor (regras de
 * create/update/delete fechadas — a ingestão roda no servidor, não no navegador).
 */
migrate(
  (app) => {
    const metricas = new Collection({
      name: 'metricas_diarias',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        new TextField({ name: 'origem', required: true, max: 20 }), // api | csv | demonstracao
        new TextField({ name: 'canal', required: true, max: 30 }), // meta_ads | google_ads | meta_organico
        new TextField({ name: 'natureza', required: true, max: 12 }), // pago | organico
        new TextField({ name: 'conta_id', max: 60 }),
        new TextField({ name: 'conta_nome', max: 120 }),
        new TextField({ name: 'campanha_id', required: true, max: 60 }),
        new TextField({ name: 'campanha_nome', required: true, max: 200 }),
        new TextField({ name: 'objetivo', required: true, max: 20 }),
        new DateField({ name: 'data', required: true }), // dia da métrica (yyyy-mm-dd)
        new NumberField({ name: 'alcance' }),
        new NumberField({ name: 'impressoes' }),
        new NumberField({ name: 'cliques' }),
        new NumberField({ name: 'gasto' }),
        new NumberField({ name: 'resultados' }),
        new NumberField({ name: 'cpc' }),
        new NumberField({ name: 'cpm' }),
        new NumberField({ name: 'ctr' }),
        new AutodateField({ name: 'created', onCreate: true, onUpdate: false }),
        new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }),
      ],
      indexes: [
        'CREATE UNIQUE INDEX idx_metricas_unica ON metricas_diarias (origem, canal, campanha_id, data)',
        'CREATE INDEX idx_metricas_canal_data ON metricas_diarias (canal, data)',
      ],
    })
    app.save(metricas)

    const fontes = new Collection({
      name: 'fontes_estado',
      type: 'base',
      listRule: "@request.auth.id != ''",
      viewRule: "@request.auth.id != ''",
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        new TextField({ name: 'canal', required: true, max: 30 }),
        new SelectField({
          name: 'estado',
          required: true,
          maxSelect: 1,
          values: ['conectado', 'nao_conectado', 'erro_autenticacao', 'sem_dados'],
        }),
        new TextField({ name: 'aviso', max: 500 }),
        new DateField({ name: 'ultima_ingestao' }),
        new AutodateField({ name: 'created', onCreate: true, onUpdate: false }),
        new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }),
      ],
      indexes: ['CREATE UNIQUE INDEX idx_fontes_canal ON fontes_estado (canal)'],
    })
    app.save(fontes)

    console.log('migração 0001 aplicada: metricas_diarias + fontes_estado')
  },
  (app) => {
    const m = app.findCollectionByNameOrId('metricas_diarias')
    app.delete(m)
    const f = app.findCollectionByNameOrId('fontes_estado')
    app.delete(f)
    console.log('migração 0001 revertida')
  },
)
