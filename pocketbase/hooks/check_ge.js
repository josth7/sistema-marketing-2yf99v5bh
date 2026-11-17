/// <reference path="../pb_data/types.d.ts" />
/**
 * GOOGLE ADS POR EMPRESA (17/11).
 *
 * O dono quer saber por que a Haisan "não tem informação google" — a fonte
 * `google_ads` dela está parada desde 07/10.
 *
 * Aqui se mostra, para cada empresa:
 *   - quantos registros de google_ads existem e qual a data mais recente;
 *   - o que `fontes_estado` diz da fonte;
 *   - se aparece no painel (métricas e custo).
 *
 * GET /backend/v1/check/google-empresas
 */
routerAdd(
  'GET',
  '/backend/v1/check/google-empresas',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, empresas: [], segredo_google: '', segredo_meta: '' }

    try {
      out.segredo_google = String($secrets.get('EMPRESA_GOOGLE_ADS') || '(vazio)')
      out.segredo_meta = String($secrets.get('EMPRESA_META_ADS') || '(vazio)')
    } catch (eS) {
      out.segredo_google = '(erro ao ler)'
    }

    var empresas = []
    try {
      empresas = app.findRecordsByFilter('empresas', 'ativa=true', '', 20, 0)
    } catch (e0) {}

    for (const emp of empresas) {
      const id = emp.id
      const ap = String(emp.get('apelido') || emp.get('nome') || '')
      const item = { empresa: ap, id: id.slice(0, 8), google: {}, meta: {} }

      // métricas por canal
      for (const canal of ['google_ads', 'meta_ads']) {
        var regs = []
        try {
          regs = app.findRecordsByFilter(
            app.findCollectionByNameOrId('metricas_diarias'),
            "canal='" + canal + "' && empresa='" + id + "'",
            '-data',
            2000,
            0,
          )
        } catch (e1) {}
        var ultima = ''
        var custo = 0
        var impressoes = 0
        for (const r of regs) {
          const d = String(r.get('data') || '').slice(0, 10)
          if (d > ultima) ultima = d
          custo += Number(r.get('custo') || 0)
          impressoes += Number(r.get('impressoes') || 0)
        }
        item[canal === 'google_ads' ? 'google' : 'meta'] = {
          registros: regs.length,
          ultima_data: ultima || '(nenhuma)',
          custo_total: Math.round(custo * 100) / 100,
          impressoes: impressoes,
        }
      }

      // fontes_estado
      try {
        const fe = app.findRecordsByFilter(
          app.findCollectionByNameOrId('fontes_estado'),
          "empresa='" + id + "'",
          '',
          20,
          0,
        )
        item.fontes = []
        for (const f of fe) {
          item.fontes.push({
            canal: String(f.get('canal') || ''),
            estado: String(f.get('estado') || ''),
            ultima_ingestao: String(f.get('ultima_ingestao') || '').slice(0, 16),
            aviso: String(f.get('aviso') || '').slice(0, 80),
          })
        }
      } catch (e2) {}

      out.empresas.push(item)
    }

    // e os registros sem empresa?
    try {
      out.sem_empresa = app.findRecordsByFilter(
        app.findCollectionByNameOrId('metricas_diarias'),
        "empresa=''",
        '',
        50,
        0,
      ).length
    } catch (e3) {
      out.sem_empresa = '?'
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
