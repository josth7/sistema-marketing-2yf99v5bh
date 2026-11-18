/// <reference path="../pb_data/types.d.ts" />
/** 0127 — VERIFICA o acesso concedido à conta haisan.ecmm@gmail.com (18/11). */
migrate(
  (app) => {
    const EMAIL = 'haisan.ecmm@gmail.com'
    const us = app.findRecordsByFilter('users', "email='" + EMAIL + "'", '', 1, 0)
    if (!us.length) {
      console.log('0127: conta NAO existe')
      return
    }
    const u = us[0]
    console.log(
      '0127: conta id=' + u.id.slice(0, 12) + ' nome=' + String(u.get('name') || '(vazio)'),
    )
    const gs = app.findRecordsByFilter(
      'access_grants',
      "user_id='" + u.id + "' && revoked_at=''",
      '',
      10,
      0,
    )
    console.log('0127: grants ativos = ' + gs.length)
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
      console.log(
        '0127: role=' +
          String(g.get('role') || '') +
          ' acoes=' +
          (Array.isArray(atos) ? atos.length : 0) +
          ' escopo=' +
          (Array.isArray(esc) ? esc.join(',') : '?'),
      )
      if (Array.isArray(atos) && Array.isArray(esc))
        console.log(
          '0127: tem manage_access=' +
            (atos.indexOf('manage_access') >= 0) +
            ' escopo_tudo=' +
            (esc.indexOf('*') >= 0),
        )
    }
  },
  (app) => {},
)
