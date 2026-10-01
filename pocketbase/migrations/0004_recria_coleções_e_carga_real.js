/**
 * Migração 0004 — recria metricas_diarias e fontes_estado COM os campos
 * (a 0001 criou as coleções sem fields — registros ficaram vazios) e semeia
 * a carga inicial REAL lida das APIs (Meta 02/10, Google 30/09).
 *
 * Regras: leitura pública (métricas agregadas, sem dado pessoal), escrita
 * fechada (só hooks/servidor). RN-06: ausente = null. Objetivo não exposto
 * pelas APIs → 'nao_informado'.
 */
migrate(
  (app) => {
    // ---- recriar coleções (dados antigos eram vazios — nada a perder) ----
    try {
      app.delete(app.findCollectionByNameOrId('metricas_diarias'))
    } catch (e) {
      console.log('metricas_diarias: ' + String(e).slice(0, 80))
    }
    try {
      app.delete(app.findCollectionByNameOrId('fontes_estado'))
    } catch (e) {
      console.log('fontes_estado: ' + String(e).slice(0, 80))
    }

    const metricas = new Collection({
      name: 'metricas_diarias',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        new TextField({ name: 'origem', required: true }),
        new TextField({ name: 'canal', required: true }),
        new TextField({ name: 'natureza', required: true }),
        new TextField({ name: 'conta_id' }),
        new TextField({ name: 'conta_nome' }),
        new TextField({ name: 'campanha_id', required: true }),
        new TextField({ name: 'campanha_nome', required: true }),
        new TextField({ name: 'objetivo', required: true }),
        new DateField({ name: 'data', required: true }),
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
      ],
    })
    app.save(metricas)

    const fontes = new Collection({
      name: 'fontes_estado',
      type: 'base',
      listRule: '',
      viewRule: '',
      createRule: null,
      updateRule: null,
      deleteRule: null,
      fields: [
        new TextField({ name: 'canal', required: true }),
        new SelectField({
          name: 'estado',
          required: true,
          maxSelect: 1,
          values: ['conectado', 'nao_conectado', 'erro_autenticacao', 'sem_dados'],
        }),
        new TextField({ name: 'aviso' }),
        new DateField({ name: 'ultima_ingestao' }),
        new AutodateField({ name: 'created', onCreate: true, onUpdate: false }),
        new AutodateField({ name: 'updated', onCreate: true, onUpdate: true }),
      ],
      indexes: ['CREATE UNIQUE INDEX idx_fontes_canal ON fontes_estado (canal)'],
    })
    app.save(fontes)

    // ---- semear carga inicial REAL ----
    const linhas = [
      {
        canal: 'meta_ads',
        conta: '274282329866320',
        id: '120251846884960661',
        nome: '00 - Movienari | [TF][SleepSpaShower]',
        impr: 2160,
        cliques: 123,
        gasto: 33.95,
      },
      {
        canal: 'meta_ads',
        conta: '274282329866320',
        id: '120248202684370661',
        nome: '00 - [geral][adv.][reconhecimento] | Movienari',
        impr: 385792,
        cliques: 202,
        gasto: 594.39,
      },
      {
        canal: 'meta_ads',
        conta: '274282329866320',
        id: '120251537091590661',
        nome: '06 - [geral][adv.][LP] - Seleções de Setembro/26 | Movienari',
        impr: 67994,
        cliques: 1872,
        gasto: 780.05,
      },
      {
        canal: 'meta_ads',
        conta: '274282329866320',
        id: '120251177493430661',
        nome: '05 - [geral][adv.][LP] - Seleções de Agosto/26',
        impr: 8397,
        cliques: 291,
        gasto: 125.84,
      },
      {
        canal: 'google_ads',
        conta: '962-453-3125',
        id: '23932332914',
        nome: 'Movienari - Search - Geolocalização',
        impr: 22238,
        cliques: 1617,
        gasto: 3061.69,
      },
      {
        canal: 'google_ads',
        conta: '962-453-3125',
        id: '24271004293',
        nome: 'MOVIENARI | 00 - Inscrições YouTube',
        impr: 18523,
        cliques: 1787,
        gasto: 415.58,
      },
    ]
    for (const l of linhas) {
      const rec = new Record(metricas)
      rec.set('origem', 'api')
      rec.set('canal', l.canal)
      rec.set('natureza', 'pago')
      rec.set('conta_id', l.conta)
      rec.set('conta_nome', l.canal === 'meta_ads' ? 'Haisan (WDK)' : 'Google Ads Haisan')
      rec.set('campanha_id', l.id)
      rec.set('campanha_nome', l.nome)
      rec.set('objetivo', 'nao_informado')
      rec.set('data', '2026-09-30')
      rec.set('impressoes', l.impr)
      rec.set('cliques', l.cliques)
      rec.set('gasto', l.gasto)
      app.save(rec)
    }

    const estados = [
      {
        canal: 'meta_ads',
        aviso:
          'Primeira carga gravada com dados lidos da API em 02/10; ingestão contínua via /backend/v1/ingest pendente de segredos (META_ACCESS_TOKEN, META_ACCOUNT_ID).',
      },
      {
        canal: 'google_ads',
        aviso:
          'Primeira carga gravada com dados lidos da API em 30/09; ingestão contínua via /backend/v1/ingest pendente de segredos (GOOGLE_ADS_*).',
      },
    ]
    for (const est of estados) {
      const recF = new Record(fontes)
      recF.set('canal', est.canal)
      recF.set('estado', 'conectado')
      recF.set('aviso', est.aviso)
      recF.set('ultima_ingestao', '2026-10-02 17:00:00.000Z')
      app.save(recF)
    }

    console.log(
      'migração 0004 aplicada: coleções recriadas com campos + 6 registros reais + 2 estados',
    )
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('metricas_diarias'))
    } catch (e) {}
    try {
      app.delete(app.findCollectionByNameOrId('fontes_estado'))
    } catch (e) {}
    console.log('migração 0004 revertida')
  },
)
