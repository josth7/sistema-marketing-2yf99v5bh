/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (09/11) — como o nome sujo está gravado?
 *
 * A limpeza rodou 800 contatos e limpou **0 nomes**: a expressão não casou.
 * Aqui se mostra o texto cru para acertar o padrão antes dos 48 mil.
 *
 * GET /backend/v1/diag/nomes-crus
 */
routerAdd(
  'GET',
  '/backend/v1/diag/nomes-crus',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, amostra: [], com_numero_inicio: 0, total_lido: 0 }

    var cart = []
    try {
      cart = app.findRecordsByFilter(
        app.findCollectionByNameOrId('carteira_contatos'),
        '',
        '',
        3000,
        0,
      )
    } catch (e0) {
      return e.json(200, { ok: false, erro: String(e0).slice(0, 140) })
    }
    out.total_lido = cart.length

    for (const c of cart) {
      const n = String(c.get('nome') || '')
      if (/^\s*\d/.test(n)) {
        out.com_numero_inicio++
        if (out.amostra.length < 8) {
          out.amostra.push({
            bruto: n.slice(0, 40),
            tamanho: n.length,
            primeiros: n.slice(0, 3),
          })
        }
      }
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
