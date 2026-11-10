/// <reference path="../pb_data/types.d.ts" />
/**
 * QUE HORAS O SERVIDOR ACHA QUE SÃO? (10/11) — CA-3-117.
 *
 * O card diz que a abertura do dia roda às 5h01 por o servidor estar em UTC,
 * mas deveria ser 8h01 de Brasília. Aqui se confirma o fuso real.
 *
 * GET /backend/v1/diag/hora-servidor
 */
routerAdd(
  'GET',
  '/backend/v1/diag/hora-servidor',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const d = new Date()
    return e.json(200, {
      ok: true,
      iso: d.toISOString(),
      utc_hora: d.getUTCHours(),
      utc_min: d.getUTCMinutes(),
      local_hora: d.getHours(),
      offset_min: d.getTimezoneOffset(),
      texto: String(d),
    })
  },
  $apis.requireAuth(),
)
