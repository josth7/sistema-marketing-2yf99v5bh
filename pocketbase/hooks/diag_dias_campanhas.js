/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO PONTUAL (06/11) — o campo `dias` foi gravado?
 *
 * A rota de criação passou a gravar `dias` e `intervalo_dias`, mas o teste lê
 * a PRIMEIRA campanha da lista (a antiga). Aqui se lê cada campanha pelo nome,
 * com os campos crus, para conferir se os valores novos entraram.
 *
 * GET /backend/v1/diag/dias-campanhas
 */
routerAdd(
  'GET',
  '/backend/v1/diag/dias-campanhas',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const col = $app.findCollectionByNameOrId('campanhas')
    const cs = $app.findRecordsByFilter(col, '', '', 30, 0)
    const itens = []
    for (const c of cs) {
      var dias = ''
      try {
        const b = c.get('dias')
        dias = typeof b === 'string' ? b : JSON.stringify(b)
      } catch (e0) {}
      itens.push({
        nome: String(c.get('nome') || ''),
        estado: String(c.get('estado') || ''),
        dias_bruto: dias,
        intervalo: Number(c.get('intervalo_dias') || 0),
        hora_inicio: String(c.get('hora_inicio') || ''),
        hora_fim: String(c.get('hora_fim') || ''),
      })
    }
    return e.json(200, { ok: true, total: itens.length, itens: itens })
  },
  $apis.requireAuth(),
)
