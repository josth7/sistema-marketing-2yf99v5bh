/// <reference path="../pb_data/types.d.ts" />
/**
 * O WEBHOOK RECEBEU ALGO ÀS 11:10? (11/11) — piloto.
 *
 * A conversa do 41989036170 não apareceu. Duas hipóteses:
 *   1. o webhook não recebeu nada (número errado, sessão caída);
 *   2. recebeu e não gravou (erro no código).
 *
 * Aqui se mostram os eventos das últimas 2 horas e as mensagens recebidas,
 * para saber qual das duas é.
 *
 * GET /backend/v1/piloto/recebimento
 */
routerAdd(
  'GET',
  '/backend/v1/piloto/recebimento',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, eventos_recentes: [], msgs_recentes: [], total_eventos: 0 }

    const agora = new Date().getTime()
    const limite = agora - 3 * 3600000

    // eventos das últimas 3h
    try {
      var evs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_eventos'),
        '',
        '',
        400,
        0,
      )
      for (const ev of evs) {
        const q = new Date(String(ev.get('created') || '')).getTime()
        if (!(q > 0) || q < limite) continue
        out.total_eventos++
        if (out.eventos_recentes.length < 15) {
          out.eventos_recentes.push({
            evento: String(ev.get('evento') || ''),
            quando: String(ev.get('created') || '').slice(11, 16),
            resultado: String(ev.get('resultado') || '').slice(0, 30),
            ref: String(ev.get('ref_id') || '').slice(0, 16),
          })
        }
      }
    } catch (e1) {}

    // mensagens recebidas nas últimas 3h (qualquer número)
    try {
      var msgs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_mensagens'),
        "direcao='entrada'",
        '',
        200,
        0,
      )
      for (const m of msgs) {
        const q = new Date(String(m.get('created') || '')).getTime()
        if (!(q > 0) || q < limite) continue
        if (out.msgs_recentes.length < 12) {
          out.msgs_recentes.push({
            tel: String(m.get('contato_telefone') || '').slice(-6),
            quando: String(m.get('created') || '').slice(11, 16),
            texto: String(m.get('texto') || '').slice(0, 50),
          })
        }
      }
    } catch (e2) {}

    out.agora_utc = new Date().toISOString().slice(11, 16)

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
