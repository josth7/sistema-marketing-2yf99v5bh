/// <reference path="../pb_data/types.d.ts" />
/**
 * POR QUE AS CONVERSAS DO FÁBIO ZERARAM? (10/11) — CA-3-88.
 *
 * Depois do filtro de empresa, a lista dele ficou vazia e o 403 não dispara.
 * Aqui se reproduz o MESMO bloco de cálculo, com o ID REAL do Fábio, e mostra
 * o que ele calcula.
 *
 * GET /backend/v1/diag/cv0
 */
routerAdd(
  'GET',
  '/backend/v1/diag/cv0',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, passos: [] }

    // usuário
    var fabio = null
    try {
      const us = app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        "email='fabio@haisan.com.br'",
        '',
        1,
        0,
      )
      if (us.length > 0) fabio = us[0]
    } catch (e0) {}
    if (!fabio) return e.json(200, { ok: false, erro: 'fabio nao achado' })

    function lerL(raw) {
      try {
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          return JSON.parse(String.fromCharCode.apply(null, raw))
        }
        if (typeof raw === 'string') return JSON.parse(raw)
        return raw || []
      } catch (err) {
        return []
      }
    }

    // grants dele
    var meus = []
    try {
      meus = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "user_id='" + fabio.id + "' && revoked_at=''",
        '-created',
        60,
        0,
      )
    } catch (e1) {}
    out.quantos_grants = meus.length

    var temTudo = false
    var empresas = []
    for (const g of meus) {
      const sa = lerL(g.get('scope_accounts'))
      if (Array.isArray(sa) && sa.indexOf('*') >= 0) temTudo = true
      var emp = ''
      try {
        emp = String(g.get('empresa') || '')
      } catch (e2) {}
      out.passos.push({
        passo: 'grant',
        role: String(g.get('role') || ''),
        empresa: emp,
        empresa_len: emp.length,
        escopo_tem_asterisco: Array.isArray(sa) && sa.indexOf('*') >= 0,
      })
      if (emp !== '' && empresas.indexOf(emp) < 0) empresas.push(emp)
    }
    out.empresas_do_grant = empresas
    out.tem_tudo = temTudo

    // empresa ativa calculada
    var ativa = ''
    if (empresas.length > 0) ativa = empresas[0]
    else {
      try {
        const es = app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (es.length > 0) ativa = es[0].id
      } catch (e3) {}
    }
    out.empresa_ativa = ativa
    out.empresa_ativa_len = ativa.length

    // quantas conversas existem com esse valor EXATO de empresa
    var n = 0
    try {
      n = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "fixture=false && empresa='" + ativa + "'",
        '',
        3000,
        0,
      ).length
    } catch (e4) {
      out.erro_filtro = String(e4).slice(0, 200)
    }
    out.conversas_com_essa_empresa = n

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
