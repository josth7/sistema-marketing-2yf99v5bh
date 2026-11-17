/// <reference path="../pb_data/types.d.ts" />
/**
 * COMPARAÇÃO — gasto de hoje no sistema × no Gerenciador (17/11).
 *
 * O dono conferiu: **Google R$ 91,03** e **Meta R$ 47,12**.
 * Aqui se mostra o que o sistema tem HOJE por canal, campanha a campanha.
 *
 * GET /backend/v1/check/hoje-vs-real
 */
routerAdd(
  'GET',
  '/backend/v1/check/hoje-vs-real',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, hoje: new Date().toISOString().slice(0, 10), canais: {} }

    const nomes = {}
    try {
      for (const x of app.findRecordsByFilter('empresas', '', '', 20, 0)) {
        nomes[x.id] = String(x.get('apelido') || '')
      }
    } catch (e0) {}

    for (const canal of ['google_ads', 'meta_ads']) {
      var regs = []
      try {
        regs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('metricas_diarias'),
          "canal='" + canal + "' && data>='" + out.hoje + "'",
          '-gasto',
          200,
          0,
        )
      } catch (e1) {}

      var total = 0
      var imp = 0
      var cli = 0
      const campanhas = []
      for (const r of regs) {
        const g = Number(r.get('gasto') || 0)
        total += g
        imp += Number(r.get('impressoes') || 0)
        cli += Number(r.get('cliques') || 0)
        if (campanhas.length < 12) {
          campanhas.push({
            campanha: String(r.get('campanha_nome') || '').slice(0, 34),
            gasto: Math.round(g * 100) / 100,
            imp: Number(r.get('impressoes') || 0),
            empresa: nomes[String(r.get('empresa') || '')] || '(sem empresa)',
            atualizado: String(r.get('updated') || r.get('created') || '').slice(0, 16),
          })
        }
      }
      out.canais[canal] = {
        registros: regs.length,
        gasto: Math.round(total * 100) / 100,
        impressoes: imp,
        cliques: cli,
        campanhas: campanhas,
      }
    }

    out.comparacao = {
      google: { sistema: out.canais.google_ads.gasto, gerenciador: 91.03 },
      meta: { sistema: out.canais.meta_ads.gasto, gerenciador: 47.12 },
    }
    out.diferenca = {
      google: Math.round((out.canais.google_ads.gasto - 91.03) * 100) / 100,
      meta: Math.round((out.canais.meta_ads.gasto - 47.12) * 100) / 100,
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
