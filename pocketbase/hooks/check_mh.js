/// <reference path="../pb_data/types.d.ts" />
/**
 * META ADS — a campanha da Haisan está ligada. O sistema está recebendo?
 *
 * Mostra, para a Haisan:
 *   - os registros de meta_ads dos últimos 7 dias, dia a dia;
 *   - a última data com dado e o gasto somado;
 *   - o estado da fonte (`fontes_estado`);
 *   - a última ingestão e o aviso, se houver.
 *
 * Só leitura.
 *
 * GET /backend/v1/check/meta-hoje
 */
routerAdd(
  'GET',
  '/backend/v1/check/meta-hoje',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, porDia: [], resumo: {}, fonte: null, empresas: {} }

    const nomes = {}
    try {
      for (const x of app.findRecordsByFilter('empresas', '', '', 20, 0)) {
        nomes[x.id] = String(x.get('apelido') || x.get('nome') || '')
      }
    } catch (e0) {}

    // registros de meta_ads dos últimos 10 dias
    var regs = []
    try {
      regs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('metricas_diarias'),
        "canal='meta_ads' && data>='2026-11-08'",
        '-data',
        500,
        0,
      )
    } catch (e1) {}

    const porDia = {}
    var totalGasto = 0
    var totalImp = 0
    for (const r of regs) {
      const d = String(r.get('data') || '').slice(0, 10)
      const emp = nomes[String(r.get('empresa') || '')] || '(sem empresa)'
      const k = d + '|' + emp
      if (!porDia[k]) porDia[k] = { data: d, empresa: emp, campanhas: 0, gasto: 0, imp: 0 }
      porDia[k].campanhas++
      porDia[k].gasto += Number(r.get('gasto') || 0)
      porDia[k].imp += Number(r.get('impressoes') || 0)
      if (emp === 'Haisan') {
        totalGasto += Number(r.get('gasto') || 0)
        totalImp += Number(r.get('impressoes') || 0)
      }
    }
    const chaves = Object.keys(porDia).sort()
    for (const k of chaves) {
      const v = porDia[k]
      v.gasto = Math.round(v.gasto * 100) / 100
      out.porDia.push(v)
    }

    out.resumo = {
      registros: regs.length,
      haisan_gasto: Math.round(totalGasto * 100) / 100,
      haisan_impressoes: totalImp,
      ultima_data: chaves.length > 0 ? porDia[chaves[chaves.length - 1]].data : '(nenhuma)',
      hoje: new Date().toISOString().slice(0, 10),
    }

    // fonte
    try {
      const fe = app.findRecordsByFilter(
        app.findCollectionByNameOrId('fontes_estado'),
        "canal='meta_ads'",
        '',
        5,
        0,
      )
      if (fe.length > 0) {
        out.fonte = {
          empresa: nomes[String(fe[0].get('empresa') || '')] || '(sem empresa)',
          estado: String(fe[0].get('estado') || ''),
          ultima_ingestao: String(fe[0].get('ultima_ingestao') || '').slice(0, 19),
          aviso: String(fe[0].get('aviso') || '').slice(0, 120),
        }
      }
    } catch (e2) {}

    // empresas com meta
    for (const r of regs) {
      const emp = nomes[String(r.get('empresa') || '')] || '(sem empresa)'
      out.empresas[emp] = (out.empresas[emp] || 0) + 1
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
