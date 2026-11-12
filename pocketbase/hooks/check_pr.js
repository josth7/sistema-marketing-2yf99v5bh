/// <reference path="../pb_data/types.d.ts" />
/**
 * O QUE O BOARD NÃO MOSTRA (12/11).
 *
 * 1. 2 leads SEM DONO voltaram a aparecer.
 * 2. O cron `wa_orfaos` deveria resolvê-los — está rodando?
 * 3. 130 clientes esperando, sendo 26 com mais de 7 dias.
 *
 * GET /backend/v1/check/pendente-real
 */
routerAdd(
  'GET',
  '/backend/v1/check/pendente-real',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, sem_dono: [], crons: [] }

    // os leads sem dono
    try {
      const ls = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        "owner_id='' && fixture=false",
        '',
        50,
        0,
      )
      for (const l of ls) {
        if (out.sem_dono.length >= 8) break
        const st = String(l.get('status') || '')
        if (st === 'descartado') continue
        out.sem_dono.push({
          nome: String(l.get('nome') || '').slice(0, 20),
          tel: String(l.get('telefone') || '').slice(-6),
          status: st,
          criado: String(l.get('created') || '').slice(0, 16),
        })
      }
      out.sem_dono_total = ls.length
    } catch (e0) {}

    // os crons de distribuição
    try {
      for (const c of app.findRecordsByFilter('_cron_settings', '', '', 100, 0)) {
        const j = String(c.get('job') || '')
        if (
          j.indexOf('orfao') >= 0 ||
          j.indexOf('aviso_lead') >= 0 ||
          j.indexOf('distribuicao') >= 0
        )
          out.crons.push({ job: j, disabled: String(c.get('disabled') || '') })
      }
    } catch (e1) {}

    // o que o wa_orfaos exige: pedido `concluida` sem dono
    try {
      const trs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_transferencias'),
        "estado='concluida'",
        '',
        300,
        0,
      )
      var resíduos = 0
      for (const t of trs) {
        var lead = null
        try {
          lead = app.findRecordById('crm_leads', String(t.get('lead')))
        } catch (e2) {
          continue
        }
        if (lead && String(lead.get('owner_id') || '') === '') resíduos++
      }
      out.residuos_pedido_concluido = resíduos
    } catch (e3) {}

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
