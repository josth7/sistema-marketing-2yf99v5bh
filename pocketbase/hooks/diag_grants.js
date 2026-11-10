/// <reference path="../pb_data/types.d.ts" />
/**
 * CONFERÊNCIA DOS GRANTS (10/11) — CA-3-90.
 *
 * O dono afirmou: **Fábio não terá acesso à Gol 7.** Aqui se mostra o vínculo
 * de cada pessoa com a empresa, para confirmar que:
 *   - os 4 vendedores têm grant **só da Haisan**;
 *   - só os donos têm as duas (quando a Gol 7 existir).
 *
 * GET /backend/v1/diag/grants-empresa
 */
routerAdd(
  'GET',
  '/backend/v1/diag/grants-empresa',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, empresas: [], pessoas: [] }

    const nomesEmp = {}
    try {
      for (const x of app.findRecordsByFilter('empresas', '', '', 20, 0)) {
        nomesEmp[x.id] = String(x.get('apelido') || x.get('nome') || '')
        out.empresas.push({ id: x.id.slice(0, 10), nome: nomesEmp[x.id] })
      }
    } catch (e0) {}

    const nomes = {}
    try {
      for (const u of app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        '',
        '',
        300,
        0,
      )) {
        nomes[u.id] = String(u.get('name') || u.get('email') || '')
      }
    } catch (e1) {}

    var gs = []
    try {
      gs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "revoked_at=''",
        '',
        300,
        0,
      )
    } catch (e2) {
      return e.json(200, { ok: false, erro: String(e2).slice(0, 120) })
    }

    for (const g of gs) {
      const uid = String(g.get('user_id') || '')
      const emp = String(g.get('empresa') || '')
      const nome = nomes[uid] || uid.slice(0, 8)
      if (nome.toLowerCase().indexOf('fixture') >= 0) continue
      out.pessoas.push({
        nome: nome,
        papel: String(g.get('role') || ''),
        empresa: nomesEmp[emp] || (emp === '' ? '(vazio)' : emp.slice(0, 8)),
      })
    }
    out.pessoas.sort(function (a, b) {
      return a.nome < b.nome ? -1 : 1
    })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
