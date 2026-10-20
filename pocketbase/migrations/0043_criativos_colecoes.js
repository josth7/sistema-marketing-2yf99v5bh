/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0043 — SPEC-3-002 card 1 (CA-3-04): coleções de criativos.
 * - anuncios_criativos: criativo/textos/URL por anúncio (UNIQUE fonte+conta+anuncio);
 * - metricas_diarias_anuncio: métricas diárias por anúncio (UNIQUE fonte+conta+anuncio+data);
 * - paginas_destino: instantâneo textual da página (UNIQUE url normalizada).
 * Regras de API NULAS (acesso só pelas rotas /backend/v1/). Plain objects
 * nos fields (lição AP-2026-10-02/14). Ausência ≠ zero (RN-06 fase 1).
 */
migrate(
  (app) => {
    let colA
    try {
      colA = app.findCollectionByNameOrId('anuncios_criativos')
      console.log('migração 0043: anuncios_criativos já existe')
    } catch (_) {
      colA = new Collection({
        name: 'anuncios_criativos',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'fonte', type: 'text', required: true, max: 20 },
          { name: 'conta_id', type: 'text', required: true, max: 64 },
          { name: 'campanha_id', type: 'text', max: 64 },
          { name: 'conjunto_id', type: 'text', max: 64 },
          { name: 'anuncio_id', type: 'text', required: true, max: 64 },
          { name: 'nome', type: 'text', max: 200 },
          { name: 'status', type: 'text', max: 40 },
          { name: 'formato', type: 'text', max: 20 },
          { name: 'titulo', type: 'text', max: 300 },
          { name: 'corpo', type: 'text', max: 2000 },
          { name: 'cta', type: 'text', max: 60 },
          { name: 'imagem_url', type: 'text', max: 600 },
          { name: 'thumbnail_url', type: 'text', max: 600 },
          { name: 'video_id', type: 'text', max: 64 },
          { name: 'url_destino', type: 'text', max: 600 },
          { name: 'tipo_destino', type: 'text', max: 20 },
          { name: 'hash_conteudo', type: 'text', max: 80 },
          { name: 'visto_primeiro_em', type: 'date' },
          { name: 'visto_ultimo_em', type: 'date' },
          { name: 'criativo_indisponivel', type: 'bool' },
          { name: 'motivo', type: 'text', max: 200 },
          { name: 'fixture', type: 'bool' },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: [
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_anuncio_unico ON anuncios_criativos (fonte, conta_id, anuncio_id)',
        ],
      })
      app.save(colA)
      console.log('migração 0043: anuncios_criativos criada (regras nulas)')
    }
    let colM
    try {
      colM = app.findCollectionByNameOrId('metricas_diarias_anuncio')
      console.log('migração 0043: metricas_diarias_anuncio já existe')
    } catch (_) {
      colM = new Collection({
        name: 'metricas_diarias_anuncio',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'fonte', type: 'text', required: true, max: 20 },
          { name: 'conta_id', type: 'text', required: true, max: 64 },
          { name: 'anuncio_id', type: 'text', required: true, max: 64 },
          { name: 'campanha_id', type: 'text', max: 64 },
          { name: 'data', type: 'date', required: true },
          { name: 'impressoes', type: 'number' },
          { name: 'alcance', type: 'number' },
          { name: 'cliques', type: 'number' },
          { name: 'gasto', type: 'number' },
          { name: 'resultados', type: 'number' },
          { name: 'result_type', type: 'text', max: 40 },
          { name: 'fixture', type: 'bool' },
        ],
        indexes: [
          'CREATE UNIQUE INDEX IF NOT EXISTS idx_metrica_anuncio_unica ON metricas_diarias_anuncio (fonte, conta_id, anuncio_id, data)',
        ],
      })
      app.save(colM)
      console.log('migração 0043: metricas_diarias_anuncio criada (regras nulas)')
    }
    let colP
    try {
      colP = app.findCollectionByNameOrId('paginas_destino')
      console.log('migração 0043: paginas_destino já existe')
    } catch (_) {
      colP = new Collection({
        name: 'paginas_destino',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'url', type: 'text', required: true, max: 600 },
          { name: 'host', type: 'text', max: 200 },
          { name: 'titulo', type: 'text', max: 300 },
          { name: 'meta_description', type: 'text', max: 500 },
          { name: 'h1', type: 'text', max: 300 },
          { name: 'texto_resumo', type: 'text', max: 2200 },
          { name: 'status_http', type: 'number', onlyInt: true },
          { name: 'tamanho_bytes', type: 'number', onlyInt: true },
          { name: 'truncado', type: 'bool' },
          { name: 'hash_html', type: 'text', max: 80 },
          { name: 'capturado_em', type: 'date' },
          { name: 'motivo_falha', type: 'text', max: 100 },
          { name: 'fixture', type: 'bool' },
        ],
        indexes: ['CREATE UNIQUE INDEX IF NOT EXISTS idx_pagina_url ON paginas_destino (url)'],
      })
      app.save(colP)
      console.log('migração 0043: paginas_destino criada (regras nulas)')
    }
  },
  (app) => {
    console.log(
      'migração 0043 revertida: coleções de criativos permanecem (rollback não remove dados)',
    )
  },
)
