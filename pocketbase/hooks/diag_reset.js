/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO PONTUAL (06/11) — reseta a conversão de prova para o próximo cenário.
 *
 * A prova do CA-3-60 testa 4 respostas da Meta em sequência (200, 401, 429, 500).
 * Entre uma e outra é preciso devolver a conversão para `pending` com tentativas
 * zeradas, senão o cron não a pega de novo.
 *
 * POST /backend/v1/diag/reseta-conv
 */
routerAdd(
  'POST',
  '/backend/v1/diag/reseta-conv',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const col = $app.findCollectionByNameOrId('conversion_events')
    var n = 0
    try {
      const rs = $app.findRecordsByFilter(col, "dedupe_key='conv-prova-capi'", '', 3, 0)
      for (const c of rs) {
        c.set('estado', 'pending')
        c.set('tentativas', 0)
        c.set('ultimo_erro', '')
        $app.save(c)
        n++
      }
    } catch (e0) {
      return e.json(500, { ok: false, erro: String(e0).slice(0, 120) })
    }
    return e.json(200, { ok: true, res: n })
  },
  $apis.requireAuth(),
)
