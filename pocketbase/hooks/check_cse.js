/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/corrige-sememp',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const ex = String(e.request.url.query().get('executar') || '') === '1'
    const out = { ok: true, executar: ex, corrigidos: [], antes: 0 }
    // a empresa da fonte meta_ads: a que JA tem metricas de meta_ads
    var donaMeta = ''
    const cont = {}
    for (const m of app.findRecordsByFilter(
      app.findCollectionByNameOrId('metricas_diarias'),
      "canal='meta_ads' && empresa!=''",
      '',
      3000,
      0,
    )) {
      const em = String(m.get('empresa') || '')
      cont[em] = (cont[em] || 0) + 1
    }
    var maior = 0
    for (const k in cont)
      if (cont[k] > maior) {
        maior = cont[k]
        donaMeta = k
      }
    out.empresa_detectada = donaMeta.slice(0, 8)
    // as fontes_estado dizem: meta_ads = Haisan
    const semEmp = app.findRecordsByFilter(
      app.findCollectionByNameOrId('metricas_diarias'),
      "empresa=''",
      '',
      50,
      0,
    )
    out.antes = semEmp.length
    for (const m of semEmp) {
      const canal = String(m.get('canal') || '')
      // so corrige se a fonte tem UMA empresa clara
      var alvo = ''
      if (canal === 'meta_ads') alvo = donaMeta
      if (alvo === '') continue
      out.corrigidos.push({
        canal: canal,
        campanha: String(m.get('campanha_nome') || '').slice(0, 24),
        data: String(m.get('data') || '').slice(0, 10),
        para: alvo.slice(0, 8),
      })
      if (ex) {
        try {
          m.set('empresa', alvo)
          app.save(m)
        } catch (e1) {
          out.erro = String(e1).slice(0, 100)
        }
      }
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
