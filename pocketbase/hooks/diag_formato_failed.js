/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (09/11) — qual é o FORMATO REAL do `message.failed`?
 *
 * O CA-3-108 pede que o `message.failed` seja lido no formato que a D-API manda
 * de verdade, conferido nos **eventos guardados de 09/11**.
 *
 * O código lê `data.error.message` / `data.error.code`. Se o payload real usa
 * outra chave, o webhook grava `falha_nao_informada` — e o vendedor nunca sabe
 * por que a mensagem não chegou.
 *
 * Aqui se mostra o payload cru dos eventos de falha, com telefone mascarado.
 *
 * GET /backend/v1/diag/formato-failed
 */
routerAdd(
  'GET',
  '/backend/v1/diag/formato-failed',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, eventos: [], chaves_vistas: {}, total: 0 }

    var evs = []
    try {
      evs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_eventos'),
        '',
        '',
        400,
        0,
      )
    } catch (e0) {
      return e.json(200, { ok: false, erro: String(e0).slice(0, 140) })
    }

    for (const ev of evs) {
      const tipo = String(ev.get('tipo') || ev.get('evento') || '')
      if (tipo.indexOf('fail') < 0 && tipo.indexOf('falh') < 0) continue
      out.total++
      const bruto = String(ev.get('payload') || ev.get('bruto') || ev.get('detalhe') || '')
      var limpo = bruto.replace(/[0-9]{10,}/g, '***')
      if (out.eventos.length < 3) {
        out.eventos.push({
          tipo: tipo,
          criado: String(ev.get('created') || '').slice(0, 16),
          recorte: limpo.slice(0, 600),
        })
      }
      // tenta as chaves mais comuns
      try {
        const j = JSON.parse(bruto)
        var alvo = j.data || j
        var chaves = Object.keys(alvo).join(',')
        out.chaves_vistas[chaves] = (out.chaves_vistas[chaves] || 0) + 1
      } catch (e1) {}
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
