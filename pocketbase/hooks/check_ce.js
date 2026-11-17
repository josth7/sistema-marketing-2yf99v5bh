/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/campos-empresa',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, campos: [], tem: {}, goo7: null }
    const det = app.findCollectionByNameOrId('empresas')
    for (const f of det.fields || []) out.campos.push(String(f.name))
    out.tem.token = out.campos.indexOf('meta_token_segredo') >= 0
    out.tem.conta = out.campos.indexOf('meta_conta_segredo') >= 0
    for (const x of app.findRecordsByFilter('empresas', '', '', 20, 0)) {
      if (String(x.get('apelido') || '') === 'GOO7') {
        out.goo7 = {
          id: x.id.slice(0, 10),
          apelido: String(x.get('apelido') || ''),
          token: String(x.get('meta_token_segredo') || '(vazio)'),
          conta: String(x.get('meta_conta_segredo') || '(vazio)'),
        }
      }
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
