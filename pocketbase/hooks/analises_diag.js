/// <reference path="../pb_data/types.d.ts" />
// Diagnóstico: hook mínimo para confirmar carga de rotas
routerAdd(
  'GET',
  '/backend/v1/analises/diag',
  (e) => {
    let seg = ''
    try {
      seg = $secrets.get('FIXTURE_TICK_SECRET') || ''
    } catch (eS) {
      return e.json(200, { ok: true, diag: 'secrets-get-erro: ' + String(eS).slice(0, 100) })
    }
    let hs = ''
    try {
      hs = $security.hs256('teste', 'chave-teste')
    } catch (eH) {
      return e.json(200, {
        ok: true,
        diag: 'hs256-erro: ' + String(eH).slice(0, 100),
        seg_len: seg.length,
      })
    }
    let eq = ''
    try {
      eq = String($security.equal('a', 'a'))
    } catch (eE) {
      eq = 'equal-erro: ' + String(eE).slice(0, 100)
    }
    return e.json(200, { ok: true, diag: 'ok', seg_len: seg.length, hs_len: hs.length, equal: eq })
  },
  null,
)
