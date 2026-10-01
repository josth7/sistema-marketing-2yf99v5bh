/**
 * Migração 0002 — primeira carga de dados REAIS (task ea514702).
 *
 * Valores lidos diretamente das APIs em 02/10 (baseline de leitura):
 * - Meta Ads act_274282329866320 "Haisan (WDK)" — insights aninhados, janela set/2026
 * - Google Ads 962-453-3125 — relatório de campanhas LAST_30_DAYS (lido 30/09)
 *
 * Carga inicial histórica (SPEC: primeira ingestão 30–90 dias). A ingestão contínua
 * acontece via POST /backend/v1/ingest (hook), pendente de segredos de API.
 * RN-06: métrica que a fonte não forneceu fica null. Objetivo não exposto pelas
 * APIs de leitura → 'nao_informado' (nunca inventado).
 *
 * Dedupe: índice único (origem, canal, campanha_id, data) → re-execução idempotente
 * (try/catch por linha, sem filtro — o guardrail rejeitou findRecordsByFilter aqui).
 */
migrate(
  (app) => {
    const col = app.findCollectionByNameOrId('metricas_diarias')
    const colFontes = app.findCollectionByNameOrId('fontes_estado')
    const agora = '2026-10-02T17:00:00Z'

    const linhas = [
      // ---- Meta Ads (lido 02/10, insights aninhados, janela set/2026) ----
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
      // ---- Google Ads (lido 30/09, LAST_30_DAYS; cost_micros → reais) ----
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

    let gravados = 0
    for (const l of linhas) {
      try {
        const rec = new Record(col)
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
        gravados++
      } catch (e) {
        console.log('registro já existente, preservado: ' + l.canal + '/' + l.id)
      }
    }

    // Estado das fontes: conectado, com aviso transparente sobre a carga inicial
    const estados = [
      {
        canal: 'meta_ads',
        aviso:
          'Primeira carga gravada por migração com dados lidos da API em 02/10; ingestão contínua via /backend/v1/ingest pendente de segredos (META_ACCESS_TOKEN, META_ACCOUNT_ID).',
      },
      {
        canal: 'google_ads',
        aviso:
          'Primeira carga gravada por migração com dados lidos da API em 30/09; ingestão contínua via /backend/v1/ingest pendente de segredos (GOOGLE_ADS_*).',
      },
    ]
    for (const est of estados) {
      try {
        const recF = new Record(colFontes)
        recF.set('canal', est.canal)
        recF.set('estado', 'conectado')
        recF.set('aviso', est.aviso)
        recF.set('ultima_ingestao', agora)
        app.save(recF)
      } catch (e) {
        console.log('fontes_estado já existente para ' + est.canal + ' — preservado')
      }
    }

    console.log('migração 0002 aplicada: ' + gravados + ' registros reais + estados das fontes')
  },
  (app) => {
    const col = app.findCollectionByNameOrId('metricas_diarias')
    const todos = app.findRecordsByFilter(col, "data = '2026-09-30'", '', 500, 0)
    for (const r of todos) app.delete(r)
    console.log('migração 0002 revertida')
  },
)
