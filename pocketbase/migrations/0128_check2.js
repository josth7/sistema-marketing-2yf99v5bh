/// <reference path="../pb_data/types.d.ts" />
/** 0128 — LE e IMPRIME o estado final da conta ecmm (18/11). */
migrate(
  (app) => {
    const EMAIL = 'haisan.ecmm@gmail.com'
    const us = app.findRecordsByFilter('users', "email='" + EMAIL + "'", '', 1, 0)
    if (!us.length) {
      console.log('0128: RESULTADO conta=NAO_EXISTE')
      return
    }
    const u = us[0]
    const gs = app.findRecordsByFilter(
      'access_grants',
      "user_id='" + u.id + "' && revoked_at=''",
      '',
      10,
      0,
    )
    var totalAcoes = 0,
      escopoTudo = false
    for (const g of gs) {
      var atos = [],
        esc = []
      try {
        const rA = g.get('actions')
        atos =
          Array.isArray(rA) && rA.length > 0 && typeof rA[0] === 'number'
            ? JSON.parse(String.fromCharCode.apply(null, rA))
            : typeof rA === 'string'
              ? JSON.parse(rA)
              : rA || []
      } catch (e1) {}
      try {
        const rE = g.get('scope_accounts')
        esc =
          Array.isArray(rE) && rE.length > 0 && typeof rE[0] === 'number'
            ? JSON.parse(String.fromCharCode.apply(null, rE))
            : typeof rE === 'string'
              ? JSON.parse(rE)
              : rE || []
      } catch (e2) {}
      if (Array.isArray(atos)) totalAcoes = Math.max(totalAcoes, atos.length)
      if (Array.isArray(esc) && esc.indexOf('*') >= 0) escopoTudo = true
    }
    console.log(
      '0128: RESULTADO conta=EXISTE grants=' +
        gs.length +
        ' acoes=' +
        totalAcoes +
        ' escopo_tudo=' +
        escopoTudo,
    )
  },
  (app) => {},
)
