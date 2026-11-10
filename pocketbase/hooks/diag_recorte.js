/// <reference path="../pb_data/types.d.ts" />
/**
 * O FORMATO REAL DO `message.failed` (10/11) — CA-3-108.
 *
 * Dois eventos de falha reais foram capturados hoje (Fábio e Adriana). O campo
 * `codigo_erro` guarda o recorte do payload: `chaves` (quais campos vieram),
 * `error`, `status`, `reason`, `details`.
 *
 * Aqui se mostra esse recorte **completo** para ajustar o parser.
 *
 * GET /backend/v1/diag/recorte-failed
 */
routerAdd(
  'GET',
  '/backend/v1/diag/recorte-failed',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, itens: [] }

    var evs = []
    try {
      evs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_eventos'),
        "evento='message.failed' && resultado='falha_meta'",
        '',
        10,
        0,
      )
    } catch (e0) {
      return e.json(200, { ok: false, erro: String(e0).slice(0, 120) })
    }

    for (const ev of evs) {
      out.itens.push({
        quando: String(ev.get('recebido_em') || ev.get('created') || '').slice(0, 16),
        recorte: String(ev.get('codigo_erro') || '').slice(0, 900),
      })
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
