/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (09/11) — diferença no grant da Elisângela.
 *
 * Três vendedoras respondem e uma não. Aqui se lê o grant de cada uma, com as
 * AÇÕES e o ESCOPO cru, para achar a diferença exata.
 *
 * GET /backend/v1/diag/compara-grants
 */
routerAdd(
  'GET',
  '/backend/v1/diag/compara-grants',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, vendedores: [] }

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

    var users = []
    try {
      users = app.findRecordsByFilter(app.findCollectionByNameOrId('users'), '', '', 300, 0)
    } catch (e0) {}

    for (const u of users) {
      const em = String(u.get('email') || '').toLowerCase()
      if (em.indexOf('@haisan') < 0) continue
      if (em.indexOf('fixture') >= 0) continue
      const nome = String(u.get('name') || '')
      if (
        nome.indexOf('Fábio') < 0 &&
        nome.indexOf('Elisangela') < 0 &&
        nome.indexOf('Adriana') < 0 &&
        nome.indexOf('Douglas') < 0
      )
        continue

      var grants = []
      try {
        const gs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('access_grants'),
          "user_id='" + u.id + "' && revoked_at=''",
          '',
          20,
          0,
        )
        for (const g of gs) {
          grants.push({
            role: String(g.get('role') || ''),
            acoes: lerL(g.get('actions')),
            escopo: lerL(g.get('scope_accounts')),
            canais: lerL(g.get('scope_channels')).length,
            versao: Number(g.get('version') || 0),
            revogado: String(g.get('revoked_at') || ''),
          })
        }
      } catch (e1) {}

      // conexão dela
      var cx = null
      try {
        const cs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_conexoes'),
          "vendedor_user='" + u.id + "'",
          '',
          3,
          0,
        )
        if (cs.length > 0) {
          cx = {
            id: cs[0].id,
            nome: String(cs[0].get('nome_exibicao') || ''),
            ativo: cs[0].get('ativo') === true,
            papel: String(cs[0].get('papel') || ''),
          }
        }
      } catch (e2) {}

      out.vendedores.push({ nome: nome, email: em, grants: grants, conexao: cx })
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
