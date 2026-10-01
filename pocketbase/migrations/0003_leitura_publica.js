/**
 * Migração 0003 — leitura pública das coleções de métricas (task ea514702).
 *
 * Motivo: o painel ainda não tem login (auth chega em fase posterior); com
 * listRule exigindo autenticação, a leitura do frontend retornava vazio mesmo
 * com dados gravados. As coleções contêm métricas AGREGADAS de campanhas
 * (impressões, cliques, gasto) — nenhum dado pessoal (LGPD-safe).
 * Escrita continua fechada (null): só hooks/servidor gravam.
 */
migrate(
  (app) => {
    const m = app.findCollectionByNameOrId('metricas_diarias')
    m.listRule = ''
    m.viewRule = ''
    app.save(m)

    const f = app.findCollectionByNameOrId('fontes_estado')
    f.listRule = ''
    f.viewRule = ''
    app.save(f)

    console.log('migração 0003 aplicada: leitura pública (métricas agregadas), escrita fechada')
  },
  (app) => {
    const m = app.findCollectionByNameOrId('metricas_diarias')
    m.listRule = "@request.auth.id != ''"
    m.viewRule = "@request.auth.id != ''"
    app.save(m)
    const f = app.findCollectionByNameOrId('fontes_estado')
    f.listRule = "@request.auth.id != ''"
    f.viewRule = "@request.auth.id != ''"
    app.save(f)
    console.log('migração 0003 revertida')
  },
)
