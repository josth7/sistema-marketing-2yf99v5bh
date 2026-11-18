/// <reference path="../pb_data/types.d.ts" />
/**
 * ESTADO DA CONTA areah@hsgmarketing.com.br e o catálogo de cargos (18/11).
 *
 * O dono pediu para criar o acesso da AGÊNCIA nesse e-mail. Antes de criar,
 * preciso saber: a conta já existe? e quais ações cada cargo concede, para dar
 * à agência o acesso certo (ler dados e relatórios, SEM mexer em acessos nem
 * em leads de cliente).
 *
 * Só leitura.
 *
 * GET /backend/v1/check/conta-agencia
 */
routerAdd(
  'GET',
  '/backend/v1/check/conta-agencia',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, email: 'areah@hsgmarketing.com.br', existe: false }

    // ---------- a conta ----------
    try {
      const us = app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        "email='areah@hsgmarketing.com.br'",
        '',
        1,
        0,
      )
      if (us.length > 0) {
        out.existe = true
        const u = us[0]
        out.conta = {
          id: u.id.slice(0, 12),
          nome: String(u.get('name') || '(vazio)'),
          verificado: u.get('verified') === true,
          criado: String(u.get('created') || '').slice(0, 16),
        }
        // grants
        out.grants = []
        try {
          for (const g of app.findRecordsByFilter(
            app.findCollectionByNameOrId('access_grants'),
            "user_id='" + u.id + "' && revoked_at=''",
            '',
            10,
            0,
          )) {
            out.grants.push({
              role: String(g.get('role') || ''),
              empresa: String(g.get('empresa') || '').slice(0, 10),
              criado: String(g.get('created') || '').slice(0, 16),
            })
          }
        } catch (eG) {}
      }
    } catch (e0) {}

    // ---------- catálogo: o que cada papel concede ----------
    // leio dos grants existentes, agrupando por role (é o que está em uso)
    out.catalogo = {}
    try {
      for (const g of app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "revoked_at=''",
        '',
        200,
        0,
      )) {
        const role = String(g.get('role') || '')
        if (role === '') continue
        var atos = []
        try {
          const rA = g.get('actions')
          atos =
            Array.isArray(rA) && rA.length > 0 && typeof rA[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rA))
              : typeof rA === 'string'
                ? JSON.parse(rA)
                : rA || []
        } catch (eA) {}
        if (!Array.isArray(atos)) continue
        if (!out.catalogo[role]) out.catalogo[role] = []
        for (const a of atos) {
          if (out.catalogo[role].indexOf(a) < 0) out.catalogo[role].push(a)
        }
      }
    } catch (e1) {}
    for (const r in out.catalogo) out.catalogo[r].sort()

    // ---------- empresas (para o escopo) ----------
    out.empresas = []
    try {
      for (const x of app.findRecordsByFilter('empresas', 'ativa=true', 'created', 20, 0)) {
        out.empresas.push({ id: x.id.slice(0, 10), apelido: String(x.get('apelido') || '') })
      }
    } catch (e2) {}

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
