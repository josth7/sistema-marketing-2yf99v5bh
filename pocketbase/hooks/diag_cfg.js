/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO PONTUAL (06/11) — por que o preço não aparece na config.
 *
 * A migração 0148 criou `preco_marketing`/`preco_utilidade`, o código salva e
 * devolve, mas o GET ainda mostra vazio. Aqui se lê o registro cru para ver se
 * o valor foi gravado e é só a leitura que falha — ou se o campo nem recebe.
 *
 * GET /backend/v1/diag/cfg-bruta
 */
routerAdd(
  'GET',
  '/backend/v1/diag/cfg-bruta',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const col = $app.findCollectionByNameOrId('admin_config')
    const vs = $app.findRecordsByFilter(col, '', '', 20, 0)
    const registros = []
    for (const v of vs) {
      registros.push({
        versao: Number(v.get('versao') || 0),
        tipo_marketing: typeof v.get('preco_marketing'),
        marketing: v.get('preco_marketing'),
        utilidade: v.get('preco_utilidade'),
      })
    }
    const campos = []
    for (const f of col.fields || []) campos.push(String(f.name))
    return e.json(200, { ok: true, campos: campos, registros: registros })
  },
  $apis.requireAuth(),
)
