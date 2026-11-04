/// <reference path="../pb_data/types.d.ts" />
// ===================================================================
// MIG 0113 — Anezia pode gerir acessos (manage_access) — 04/11.
//
// ACHADO: nenhum usuário real tem `manage_access`. Resultado medido:
//   GET /backend/v1/acessos/grants  -> 403 "sem permissão para gerir acessos"
//   GET /backend/v1/wa/quem-ve-o-que -> 403 "só quem tem manage_access"
//
// Ou seja: a gestão NÃO consegue ver quem vê o quê, nem mudar acesso de
// ninguém — que é justamente o próximo bloco de cards (SPEC-3-006).
//
// Por que a Anezia: ela é a gerente comercial e faz RH. O dono (Josth) fica
// com a conta dele, que já tem acesso total por ser a conta de administração.
//
// COMO: soma a ação ao grant existente (lição 0070: liberação é por OR — criar
// um grant novo com as mesmas ações NÃO soma, o UNIQUE (user_id, role, version)
// recusa). Aqui leio, adiciono e gravo o MESMO registro.
//
// Não remove nenhuma ação existente. Idempotente.
// ===================================================================
migrate(
  (app) => {
    const colU = app.findCollectionByNameOrId('users')
    const colG = app.findCollectionByNameOrId('access_grants')
    const EMAIL = 'anezia@haisan.com.br'
    const NOVA = 'manage_access'

    var achou = []
    try {
      achou = app.findRecordsByFilter(colU, "email='" + EMAIL + "'", '', 1, 0)
    } catch (e0) {
      console.log('0113: erro ao buscar Anezia: ' + e0)
      return
    }
    if (!achou || achou.length === 0) {
      console.log('0113: Anezia nao encontrada')
      return
    }
    const uid = achou[0].id

    var grants = []
    try {
      grants = app.findRecordsByFilter(
        colG,
        "user_id='" + uid + "' && revoked_at=''",
        '-created',
        5,
        0,
      )
    } catch (e1) {
      console.log('0113: erro ao buscar grants: ' + e1)
      return
    }
    if (!grants || grants.length === 0) {
      console.log('0113: Anezia sem grant ativo — nada a somar')
      return
    }

    const g = grants[0]

    // ler ações do formato que o banco devolve (pode vir como char-codes)
    var acts = []
    try {
      const raw = g.get('actions')
      if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
        acts = JSON.parse(String.fromCharCode.apply(null, raw))
      } else if (typeof raw === 'string') {
        acts = JSON.parse(raw)
      } else {
        acts = raw || []
      }
    } catch (e2) {
      acts = []
    }
    if (!Array.isArray(acts)) acts = []

    if (acts.indexOf(NOVA) >= 0) {
      console.log('0113: Anezia ja tinha ' + NOVA)
      return
    }

    acts.push(NOVA)
    try {
      g.set('actions', acts)
      app.save(g)
      console.log('0113: Anezia recebeu ' + NOVA + ' (total de ' + acts.length + ' acoes)')
    } catch (e3) {
      console.log('0113: falha ao salvar: ' + String(e3).slice(0, 200))
    }
  },
  (app) => {
    // reversível: tira só a ação que esta migração adicionou
    try {
      const colU = app.findCollectionByNameOrId('users')
      const colG = app.findCollectionByNameOrId('access_grants')
      const achou = app.findRecordsByFilter(colU, "email='anezia@haisan.com.br'", '', 1, 0)
      if (!achou || achou.length === 0) return
      const grants = app.findRecordsByFilter(
        colG,
        "user_id='" + achou[0].id + "' && revoked_at=''",
        '-created',
        5,
        0,
      )
      if (!grants || grants.length === 0) return
      const g = grants[0]
      var acts = []
      try {
        const raw = g.get('actions')
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          acts = JSON.parse(String.fromCharCode.apply(null, raw))
        } else if (typeof raw === 'string') {
          acts = JSON.parse(raw)
        } else {
          acts = raw || []
        }
      } catch (e) {}
      const sem = (acts || []).filter(function (a) {
        return a !== 'manage_access'
      })
      g.set('actions', sem)
      app.save(g)
    } catch (e0) {}
  },
)
