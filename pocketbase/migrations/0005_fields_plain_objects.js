/**
 * Migração 0005 — CORREÇÃO da causa raiz (task ea514702, debug).
 *
 * Sintoma: coleções criadas mas sem nenhum campo (só id); registros sem dados.
 * Causa raiz: 0001/0004 usaram construtores tipados (new TextField(...)) dentro
 * de new Collection({ fields: [...] }) — nesse contexto a sintaxe correta são
 * OBJETOS SIMPLES ({ name, type }); tipo errado faz o PocketBase descartar o
 * array de fields silenciosamente (documentação Skip, seção 3).
 * Correção: recriar as duas coleções com plain objects + resemear a carga real.
 */
migrate(
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('metricas_diarias'))
    } catch (e) {
      console.log('del metricas: ' + String(e).slice(0, 80))
    }
    try {
      app.delete(app.findCollectionByNameOrId('fontes_estado'))
    } catch (e) {
      console.log('del fontes: ' + String(e).slice(0, 80))
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
        { name: 'origem', type: 'text', required: true },
        { name: 'canal', type: 'text', required: true },
        { name: 'natureza', type: 'text', required: true },
        { name: 'conta_id', type: 'text' },
        { name: 'conta_nome', type: 'text' },
        { name: 'campanha_id', type: 'text', required: true },
        { name: 'campanha_nome', type: 'text', required: true },
        { name: 'objetivo', type: 'text', required: true },
        { name: 'data', type: 'date', required: true },
        { name: 'alcance', type: 'number' },
        { name: 'impressoes', type: 'number' },
        { name: 'cliques', type: 'number' },
        { name: 'gasto', type: 'number' },
        { name: 'resultados', type: 'number' },
        { name: 'cpc', type: 'number' },
        { name: 'cpm', type: 'number' },
        { name: 'ctr', type: 'number' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
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
        { name: 'canal', type: 'text', required: true },
        {
          name: 'estado',
          type: 'select',
          required: true,
          values: ['conectado', 'nao_conectado', 'erro_autenticacao', 'sem_dados'],
          maxSelect: 1,
        },
        { name: 'aviso', type: 'text' },
        { name: 'ultima_ingestao', type: 'date' },
        { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
        { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
      ],
      indexes: ['CREATE UNIQUE INDEX idx_fontes_canal ON fontes_estado (canal)'],
    })
    app.save(fontes)

    // ---- resemear carga inicial REAL (mesmos valores lidos das APIs) ----
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
      'migração 0005 aplicada: coleções com plain-object fields + 6 registros + 2 estados',
    )
  },
  (app) => {
    try {
      app.delete(app.findCollectionByNameOrId('metricas_diarias'))
    } catch (e) {}
    try {
      app.delete(app.findCollectionByNameOrId('fontes_estado'))
    } catch (e) {}
    console.log('migração 0005 revertida')
  },
)
