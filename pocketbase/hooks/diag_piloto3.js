/// <reference path="../pb_data/types.d.ts" />
/**
 * O EVENTO DE 11:11 ENTROU E NÃO VIROU CONVERSA? (11/11) — piloto.
 *
 * A conexão da central registra último evento às 14:11:18 UTC (= 11:11 BRT),
 * exatamente quando o dono mandou do 41989036170. Mas não há conversa nem
 * mensagem gravada.
 *
 * Aqui se procura o evento das 14:11 e mostra o que ele trouxe.
 *
 * GET /backend/v1/piloto/evento-1111
 */
routerAdd(
  'GET',
  '/backend/v1/piloto/evento-1111',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, eventos: [], por_evento: {}, total_hoje: 0 }

    // eventos de hoje
    var evs = []
    try {
      evs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_eventos'),
        "created>='2026-11-11'",
        '',
        300,
        0,
      )
    } catch (e1) {
      return e.json(200, { ok: false, erro: String(e1).slice(0, 140) })
    }
    out.total_hoje = evs.length

    for (const ev of evs) {
      const nome = String(ev.get('evento') || '')
      out.por_evento[nome] = (out.por_evento[nome] || 0) + 1
      const quando = String(ev.get('created') || '')
      // faixa 14:05 a 14:20 UTC
      if (quando >= '2026-11-11 14:05' && quando <= '2026-11-11 14:25') {
        out.eventos.push({
          evento: nome,
          quando: quando.slice(11, 19),
          resultado: String(ev.get('resultado') || ''),
          codigo: String(ev.get('codigo_erro') || '').slice(0, 60),
          ref: String(ev.get('ref_id') || '').slice(0, 30),
          session: String(ev.get('session_id') || '').slice(0, 20),
        })
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
