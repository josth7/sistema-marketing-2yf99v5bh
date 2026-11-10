/// <reference path="../pb_data/types.d.ts" />
/**
 * HELPER DE EMPRESA ATIVA (10/11) — CA-3-88, SPEC-3-017.
 *
 * **A peça central do multi-tenant.** Toda rota usa este helper para saber
 * **de qual empresa** ela lê e grava. Sem ele, cada rota inventa a sua conta —
 * e é assim que vaza dado entre empresas.
 *
 * **As regras da SPEC:**
 *   - usuário comum: só a empresa do grant dele;
 *   - **dono**: grant nas duas empresas e seletor no topo; é o único que troca;
 *   - `X-Empresa` pedindo empresa sem grant → **403**;
 *   - registro de outra empresa → **404** (não revela que existe).
 *
 * **Como o dono troca:** manda `X-Empresa: <id>` no header. O servidor confere
 * o grant e usa. Sem o header, usa a primeira empresa do grant.
 *
 * Rotas:
 *   GET /backend/v1/empresas           → as empresas que o usuário tem
 *   GET /backend/v1/empresas/ativa     → a empresa ativa agora
 */
routerAdd(
  'GET',
  '/backend/v1/empresas',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    const app = $app

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

    const out = { ok: true, empresas: [], ativa: '', eh_dono: false }

    // empresas do usuário: vem do grant (escopo `*` = todas)
    var ids = []
    var ehDono = false
    try {
      const gs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        20,
        0,
      )
      for (const g of gs) {
        const esc = lerL(g.get('scope_accounts'))
        if (Array.isArray(esc) && esc.indexOf('*') >= 0) ehDono = true

        // a empresa pode estar em `empresa` (campo novo) ou em scope_empresas
        var emp = ''
        try {
          emp = String(g.get('empresa') || '')
        } catch (eG) {}
        if (emp !== '' && ids.indexOf(emp) < 0) ids.push(emp)

        var lista = []
        try {
          lista = lerL(g.get('empresas'))
        } catch (eL) {}
        if (Array.isArray(lista)) {
          for (const x of lista)
            if (String(x) !== '' && ids.indexOf(String(x)) < 0) ids.push(String(x))
        }
      }
    } catch (e0) {}

    // dono vê todas as empresas ativas
    var todas = []
    try {
      todas = app.findRecordsByFilter('empresas', 'ativa=true', '', 50, 0)
    } catch (e1) {}

    for (const emp of todas) {
      const permitida = ehDono || ids.indexOf(emp.id) >= 0
      if (!permitida) continue
      out.empresas.push({
        id: emp.id,
        nome: String(emp.get('nome') || ''),
        apelido: String(emp.get('apelido') || ''),
      })
    }

    out.eh_dono = ehDono

    // empresa ativa: header X-Empresa, se o usuário tiver grant
    var pedida = ''
    try {
      pedida = String(e.request.header.get('X-Empresa') || '')
    } catch (e2) {}

    if (pedida !== '') {
      const pode = ehDono || ids.indexOf(pedida) >= 0
      if (!pode) {
        // 403: pediu empresa que não tem
        return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
      }
      out.ativa = pedida
    } else {
      // primeira da lista
      if (out.empresas.length > 0) out.ativa = out.empresas[0].id
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)

// ==================== EMPRESA ATIVA (leitura rápida) ====================
routerAdd(
  'GET',
  '/backend/v1/empresas/ativa',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app

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

    var ehDono = false
    var ids = []
    try {
      const gs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        20,
        0,
      )
      for (const g of gs) {
        const esc = lerL(g.get('scope_accounts'))
        if (Array.isArray(esc) && esc.indexOf('*') >= 0) ehDono = true
        var emp = ''
        try {
          emp = String(g.get('empresa') || '')
        } catch (eG) {}
        if (emp !== '' && ids.indexOf(emp) < 0) ids.push(emp)
      }
    } catch (e0) {}

    var pedida = ''
    try {
      pedida = String(e.request.header.get('X-Empresa') || '')
    } catch (e2) {}
    if (pedida !== '' && !ehDono && ids.indexOf(pedida) < 0) {
      return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
    }

    var ativa = pedida
    if (ativa === '') {
      try {
        const es = app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (es.length > 0) ativa = es[0].id
      } catch (e3) {}
    }

    var nome = ''
    if (ativa !== '') {
      try {
        nome = String(app.findRecordById('empresas', ativa).get('nome') || '')
      } catch (e4) {}
    }

    return e.json(200, { ok: true, empresa: ativa, nome: nome, eh_dono: ehDono })
  },
  $apis.requireAuth(),
)
