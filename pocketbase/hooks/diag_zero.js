/// <reference path="../pb_data/types.d.ts" />
/**
 * POR QUE O FÁBIO VÊ 0 CONVERSAS? (10/11) — CA-3-88.
 *
 * Depois de aplicar o filtro de empresa, a lista do Fábio ficou vazia. Aqui se
 * mostra, passo a passo: o grant dele, a empresa do grant, a empresa ativa
 * calculada e quantas conversas existem com cada empresa.
 *
 * GET /backend/v1/diag/porque-zero
 */
routerAdd(
  'GET',
  '/backend/v1/diag/porque-zero',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true }

    // o usuário Fábio
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
    if (!fabio) return e.json(200, { ok: false, erro: 'Fabio nao encontrado' })

    // o grant dele
    var gs = []
    try {
      gs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "user_id='" + fabio.id + "' && revoked_at=''",
        '',
        10,
        0,
      )
    } catch (e1) {}
    out.grants = []
    for (const g of gs) {
      out.grants.push({
        role: String(g.get('role') || ''),
        empresa: String(g.get('empresa') || '(VAZIO)').slice(0, 12),
      })
    }

    // empresas
    out.empresas = []
    try {
      for (const x of app.findRecordsByFilter('empresas', '', '', 10, 0)) {
        out.empresas.push({
          id: x.id.slice(0, 12),
          nome: String(x.get('nome') || ''),
          ativa: x.get('ativa') === true,
        })
      }
    } catch (e2) {}

    // conversas por empresa
    var convs = []
    try {
      convs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        'fixture=false',
        '',
        3000,
        0,
      )
    } catch (e3) {}
    const porEmp = {}
    var semEmp = 0
    for (const c of convs) {
      const emp = String(c.get('empresa') || '')
      if (emp === '') semEmp++
      else porEmp[emp.slice(0, 12)] = (porEmp[emp.slice(0, 12)] || 0) + 1
    }
    out.conversas_total = convs.length
    out.conversas_por_empresa = porEmp
    out.conversas_sem_empresa = semEmp

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
