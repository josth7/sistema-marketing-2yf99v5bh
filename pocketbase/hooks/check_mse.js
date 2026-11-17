/// <reference path="../pb_data/types.d.ts" />
/**
 * A ingestão da Meta está gravando SEM EMPRESA de novo (17/11 18:22).
 *
 * Duas perguntas:
 *   1. por que o registro de hoje (17/11) nasceu sem empresa?
 *   2. quantos registros ficaram sem empresa no total?
 *
 * A ingestão da Meta resolve a empresa por `idEmpresaIngest`, que no caminho
 * `meta_ads` cai no segredo `EMPRESA_META_ADS` — que NÃO está cadastrado. E o
 * fallback "empresa mais antiga" deveria pegar a Haisan. Se não pegou, há um
 * furo no caminho.
 *
 * GET /backend/v1/check/meta-sem-empresa?executar=1
 */
routerAdd(
  'GET',
  '/backend/v1/check/meta-sem-empresa',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const executar = String(e.request.url.query().get('executar') || '') === '1'
    const out = { ok: true, executar: executar, semEmpresa: [], corrigidos: 0, segredos: {} }

    // segredos relacionados
    try {
      out.segredos.EMPRESA_META_ADS = String($secrets.get('EMPRESA_META_ADS') || '(vazio)')
      out.segredos.EMPRESA_GOOGLE_ADS = String($secrets.get('EMPRESA_GOOGLE_ADS') || '(vazio)')
      out.segredos.META_ACCOUNT_ID = String($secrets.get('META_ACCOUNT_ID') || '(vazio)')
    } catch (eS) {}

    // a empresa da Haisan (a que já tem meta_ads)
    const nomes = {}
    try {
      for (const x of app.findRecordsByFilter('empresas', '', '', 20, 0)) {
        nomes[x.id] = String(x.get('apelido') || '')
      }
    } catch (e0) {}

    var donaMeta = ''
    const cont = {}
    try {
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
      for (const k in cont) {
        if (cont[k] > maior) {
          maior = cont[k]
          donaMeta = k
        }
      }
    } catch (e1) {}
    out.empresa_da_meta = donaMeta === '' ? '(nenhuma)' : nomes[donaMeta] || donaMeta.slice(0, 8)

    // os registros sem empresa
    var sem = []
    try {
      sem = app.findRecordsByFilter(
        app.findCollectionByNameOrId('metricas_diarias'),
        "empresa=''",
        '-created',
        100,
        0,
      )
    } catch (e2) {}

    for (const m of sem) {
      out.semEmpresa.push({
        canal: String(m.get('canal') || ''),
        data: String(m.get('data') || '').slice(0, 10),
        campanha: String(m.get('campanha_nome') || '').slice(0, 28),
        gasto: Number(m.get('gasto') || 0),
        criado: String(m.get('created') || '').slice(0, 16),
      })
    }

    // corrige os de meta_ads para a empresa dona
    if (executar && donaMeta !== '') {
      for (const m of sem) {
        if (String(m.get('canal') || '') !== 'meta_ads') continue
        try {
          m.set('empresa', donaMeta)
          app.save(m)
          out.corrigidos++
        } catch (e3) {}
      }
    }

    out.resumo = {
      sem_empresa: out.semEmpresa.length,
      corrigidos: out.corrigidos,
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
