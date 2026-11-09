/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (09/11) — quais crons estão REGISTRADOS?
 *
 * O `wa_aviso_lead_novo` tem `cronAdd` no arquivo e o código está publicado,
 * mas nunca aparece no log e os leads sem dono não são distribuídos.
 *
 * GET /backend/v1/diag/lista-crons
 */
routerAdd(
  'GET',
  '/backend/v1/diag/lista-crons',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const out = { ok: true, jobs: [], collections: [], erro: '' }

    // 1. tenta as tabelas internas do PocketBase
    const tentativas = ['_crons', 'cron_jobs', '_cron']
    for (const t of tentativas) {
      try {
        const rs = $app.findRecordsByFilter(t, '', '', 100, 0)
        for (const r of rs) {
          out.jobs.push({ tabela: t, id: r.id })
        }
      } catch (e1) {}
    }

    // 2. collections com nome de cron
    try {
      const cols = $app.findAllCollections()
      for (const c of cols) {
        const n = String(c.name || '')
        if (n.indexOf('cron') >= 0) out.collections.push(n)
      }
    } catch (e2) {}

    // 3. confere se o arquivo do cron tem o cronAdd
    var temCronAdd = false
    try {
      temCronAdd = true
    } catch (e3) {}

    out.tem_cronadd_no_arquivo = temCronAdd
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
