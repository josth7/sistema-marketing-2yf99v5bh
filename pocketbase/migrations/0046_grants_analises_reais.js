/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0046 — SPEC-3-002: grants de usuários reais sem as actions de análises
 * recebem read_analyses + request_analysis (idempotente — só adiciona o que falta).
 * Cobertura: anezia@haisan.com.br (management v1, escopo *) e qualquer outro grant
 * ativo de usuário real com escopo definido.
 */
migrate(
  (app) => {
    const colG = app.findCollectionByNameOrId('access_grants')
    const grants = app.findRecordsByFilter(colG, "revoked_at=''", '', 200, 0)
    let alterados = 0
    for (const g of grants) {
      // só grants com escopo definido (não-vazio) — bootstrap vazio já é acesso total
      let esc = []
      try {
        const raw = g.get('scope_accounts')
        esc =
          Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number'
            ? JSON.parse(String.fromCharCode.apply(null, raw))
            : typeof raw === 'string'
              ? JSON.parse(raw)
              : raw || []
      } catch (eS) {}
      if (!Array.isArray(esc) || esc.length === 0) continue
      let acoes = []
      try {
        const rawA = g.get('actions')
        acoes =
          Array.isArray(rawA) && rawA.length > 0 && typeof rawA[0] === 'number'
            ? JSON.parse(String.fromCharCode.apply(null, rawA))
            : typeof rawA === 'string'
              ? JSON.parse(rawA)
              : rawA || []
      } catch (eA) {}
      if (!Array.isArray(acoes)) acoes = []
      const faltantes = ['read_analyses', 'request_analysis'].filter((a) => acoes.indexOf(a) < 0)
      if (faltantes.length === 0) continue
      for (const a of faltantes) acoes.push(a)
      g.set('actions', JSON.stringify(acoes))
      app.save(g)
      alterados++
      console.log('migração 0046: grant ' + g.id + ' — +' + faltantes.join(', '))
    }
    console.log('migração 0046: ' + alterados + ' grant(s) atualizado(s)')
  },
  (app) => {
    console.log('migração 0046 revertida: actions permanecem (rollback não remove)')
  },
)
