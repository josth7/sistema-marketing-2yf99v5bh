/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/onde-caiu',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, itens: [] }
    const nomes = {}
    for (const x of app.findRecordsByFilter('empresas', '', '', 20, 0))
      nomes[x.id] = String(x.get('apelido') || x.get('nome') || '')
    for (const m of app.findRecordsByFilter(
      app.findCollectionByNameOrId('metricas_diarias'),
      "campanha_id~'teste-conta'",
      '',
      20,
      0,
    ))
      out.itens.push({
        campanha: String(m.get('campanha_nome') || ''),
        empresa:
          nomes[String(m.get('empresa') || '')] || '(VAZIO/' + String(m.get('empresa') || '') + ')',
        conta: String(m.get('conta_id') || ''),
        data: String(m.get('data') || '').slice(0, 10),
        id: m.id,
      })
    out.total = out.itens.length
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
