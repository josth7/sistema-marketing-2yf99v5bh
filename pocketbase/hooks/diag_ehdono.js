/// <reference path="../pb_data/types.d.ts" />
/**
 * QUEM É "DONO" NO SISTEMA? (10/11) — CA-3-88.
 *
 * O 403 não dispara para o Fábio. A suspeita: o escopo dele tem `*`, e o código
 * o trata como dono — o que estaria errado, porque ele é vendedor.
 *
 * Aqui se mostra o escopo REAL de cada pessoa.
 *
 * GET /backend/v1/diag/ehdono
 */
routerAdd(
  'GET',
  '/backend/v1/diag/ehdono',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, pessoas: [] }

    function lerL(raw) {
      try {
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          return JSON.parse(String.fromCharCode.apply(null, raw))
        }
        if (typeof raw === 'string') return JSON.parse(raw)
        return raw || []
      } catch (err) {
        return []
      }
    }

    var us = []
    try {
      us = app.findRecordsByFilter(app.findCollectionByNameOrId('users'), '', '', 300, 0)
    } catch (e1) {}

    for (const u of us) {
      const em = String(u.get('email') || '').toLowerCase()
      if (em.indexOf('@haisan') < 0) continue
      if (em.indexOf('fixture') >= 0) continue
      var gs = []
      try {
        gs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('access_grants'),
          "user_id='" + u.id + "' && revoked_at=''",
          '',
          20,
          0,
        )
      } catch (e2) {}
      for (const g of gs) {
        const sa = lerL(g.get('scope_accounts'))
        out.pessoas.push({
          nome: String(u.get('name') || em).slice(0, 22),
          role: String(g.get('role') || ''),
          escopo: JSON.stringify(sa).slice(0, 40),
          tem_asterisco: Array.isArray(sa) && sa.indexOf('*') >= 0,
          empresa: String(g.get('empresa') || '(vazio)').slice(0, 10),
        })
      }
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
