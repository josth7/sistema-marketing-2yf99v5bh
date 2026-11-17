/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/verif-dois',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const nomes = {}
    for (const x of app.findRecordsByFilter('empresas', '', '', 20, 0))
      nomes[x.id] = String(x.get('apelido') || '')
    const out = { ok: true, testes: [] }
    for (const m of app.findRecordsByFilter(
      app.findCollectionByNameOrId('metricas_diarias'),
      "campanha_id~'teste-'",
      '',
      20,
      0,
    ))
      out.testes.push({
        campanha: String(m.get('campanha_nome') || ''),
        empresa: nomes[String(m.get('empresa') || '')] || '(VAZIO)',
        conta: String(m.get('conta_id') || '(sem conta)'),
        id: m.id,
      })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
