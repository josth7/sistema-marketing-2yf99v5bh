/// <reference path="../pb_data/types.d.ts" />
/**
 * 0129 — PROVA do acesso da conta haisan.ecmm@gmail.com (18/11).
 * Lê o estado e LANÇA o resultado como erro, para aparecer na resposta do
 * apply_changes (os logs da plataforma atrasam ~24h e não servem para provar).
 * APAGAR depois de conferir.
 */
migrate(
  (app) => {
    const EMAIL = 'haisan.ecmm@gmail.com'
    const us = app.findRecordsByFilter('users', "email='" + EMAIL + "'", '', 1, 0)
    if (!us.length) {
      throw new Error('PROVA: conta NAO EXISTE')
    }
    const u = us[0]
    const gs = app.findRecordsByFilter(
      'access_grants',
      "user_id='" + u.id + "' && revoked_at=''",
      '',
      10,
      0,
    )
    var acoes = 0,
      tudo = false,
      role = ''
    for (const g of gs) {
      var a = [],
        e = []
      try {
        const r = g.get('actions')
        a =
          Array.isArray(r) && r.length > 0 && typeof r[0] === 'number'
            ? JSON.parse(String.fromCharCode.apply(null, r))
            : typeof r === 'string'
              ? JSON.parse(r)
              : r || []
      } catch (e1) {}
      try {
        const r2 = g.get('scope_accounts')
        e =
          Array.isArray(r2) && r2.length > 0 && typeof r2[0] === 'number'
            ? JSON.parse(String.fromCharCode.apply(null, r2))
            : typeof r2 === 'string'
              ? JSON.parse(r2)
              : r2 || []
      } catch (e2) {}
      if (Array.isArray(a) && a.length > acoes) {
        acoes = a.length
        role = String(g.get('role') || '')
      }
      if (Array.isArray(e) && e.indexOf('*') >= 0) tudo = true
    }
    throw new Error(
      'PROVA: conta=EXISTE nome=' +
        String(u.get('name') || '?') +
        ' grants=' +
        gs.length +
        ' role=' +
        role +
        ' acoes=' +
        acoes +
        ' escopo_tudo=' +
        tudo,
    )
  },
  (app) => {},
)
