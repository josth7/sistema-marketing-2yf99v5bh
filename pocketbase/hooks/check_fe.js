/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/fontes-estado',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, fontes: [], metricas_por_empresa: {} }
    const nomes = {}
    for (const x of app.findRecordsByFilter('empresas', '', '', 20, 0))
      nomes[x.id] = String(x.get('apelido') || x.get('nome') || '')
    for (const f of app.findRecordsByFilter(
      app.findCollectionByNameOrId('fontes_estado'),
      '',
      '',
      20,
      0,
    ))
      out.fontes.push({
        canal: String(f.get('canal') || ''),
        empresa: nomes[String(f.get('empresa') || '')] || '(sem empresa)',
        estado: String(f.get('estado') || ''),
        ultima: String(f.get('ultima_ingestao') || '').slice(0, 16),
        aviso: String(f.get('aviso') || '').slice(0, 50),
      })
    // metricas por empresa e canal
    for (const m of app.findRecordsByFilter(
      app.findCollectionByNameOrId('metricas_diarias'),
      '',
      '',
      3000,
      0,
    )) {
      const emp = nomes[String(m.get('empresa') || '')] || '(sem empresa)'
      const k = emp + '/' + String(m.get('canal') || '')
      out.metricas_por_empresa[k] = (out.metricas_por_empresa[k] || 0) + 1
    }
    // sobrou algum registro de teste?
    const t = app.findRecordsByFilter(
      app.findCollectionByNameOrId('metricas_diarias'),
      "campanha_id~'teste-'",
      '',
      20,
      0,
    )
    out.registros_de_teste = t.length
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
