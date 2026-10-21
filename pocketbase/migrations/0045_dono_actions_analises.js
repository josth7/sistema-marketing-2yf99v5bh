/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0045 — SPEC-3-002: o grant direction v1 do dono (josth7@icloud.com)
 * não tinha as actions de análises (read_analyses/request_analysis/manage_decisions)
 * — completar as actions mantendo scope_accounts ['*'].
 * Idempotente: só adiciona o que falta.
 */
migrate(
  (app) => {
    const users = app.findCollectionByNameOrId('users')
    let dono = null
    const registros = app.findRecordsByFilter(users, "email='josth7@icloud.com'", '', 1, 0)
    if (registros && registros.length > 0) dono = registros[0]
    if (!dono) {
      console.log('migração 0045: dono não encontrado')
      return
    }
    const colG = app.findCollectionByNameOrId('access_grants')
    const grants = app.findRecordsByFilter(
      colG,
      "user_id='" + dono.id + "' && role='direction' && revoked_at=''",
      '',
      10,
      0,
    )
    if (!grants || grants.length === 0) {
      console.log('migração 0045: nenhum grant direction ativo p/ o dono')
      return
    }
    const g = grants[0]
    let acoes = []
    try {
      const raw = g.get('actions')
      acoes =
        Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number'
          ? JSON.parse(String.fromCharCode.apply(null, raw))
          : typeof raw === 'string'
            ? JSON.parse(raw)
            : raw || []
    } catch (eA) {}
    if (!Array.isArray(acoes)) acoes = []
    const faltantes = ['read_analyses', 'request_analysis', 'manage_decisions'].filter(
      (a) => acoes.indexOf(a) < 0,
    )
    if (faltantes.length === 0) {
      console.log('migração 0045: actions já completas')
      return
    }
    for (const a of faltantes) acoes.push(a)
    g.set('actions', JSON.stringify(acoes))
    app.save(g)
    console.log('migração 0045: actions completadas p/ o dono — ' + faltantes.join(', '))
  },
  (app) => {
    console.log('migração 0045 revertida: actions permanecem (rollback não remove)')
  },
)
