/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (09/11) — o Fábio recebeu leads?
 *
 * **SÓ LEITURA.** O Fábio alega que não recebeu nenhum lead. Aqui se conta,
 * por dia e por vendedor:
 *   - leads criados (todos);
 *   - quantos foram para cada um;
 *   - os pedidos de rodízio e seus estados;
 *   - se o rodízio escolheu ele alguma vez.
 *
 * GET /backend/v1/diag/fabio-recebeu
 */
routerAdd(
  'GET',
  '/backend/v1/diag/fabio-recebeu',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = {
      ok: true,
      leads_por_dia: {},
      por_vendedor: {},
      por_vendedor_hoje: {},
      rodizio: { pedidos: 0, por_estado: {}, escolhidos: {} },
      fabio: null,
    }

    const nomes = {}
    try {
      for (const u of app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        '',
        '',
        300,
        0,
      )) {
        nomes[u.id] = String(u.get('name') || u.get('email') || '')
      }
    } catch (e0) {}

    // ---------- leads por dia/vendedor ----------
    var leads = []
    try {
      leads = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        12000,
        0,
      )
    } catch (e1) {
      return e.json(200, { ok: false, erro: String(e1).slice(0, 140) })
    }
    const hoje = new Date().toISOString().slice(0, 10)
    for (const l of leads) {
      const dia = String(l.get('created') || '').slice(0, 10)
      const dono = String(l.get('owner_id') || '')
      const n = dono !== '' ? nomes[dono] || dono : 'SEM DONO'
      out.leads_por_dia[dia] = (out.leads_por_dia[dia] || 0) + 1
      out.por_vendedor[n] = (out.por_vendedor[n] || 0) + 1
      if (dia === hoje) out.por_vendedor_hoje[n] = (out.por_vendedor_hoje[n] || 0) + 1
    }

    // ---------- pedidos de rodízio ----------
    var trs = []
    try {
      trs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_transferencias'),
        '',
        '',
        6000,
        0,
      )
    } catch (e2) {}
    for (const t of trs) {
      out.rodizio.pedidos++
      const est = String(t.get('estado') || '(vazio)')
      out.rodizio.por_estado[est] = (out.rodizio.por_estado[est] || 0) + 1
      const v = String(t.get('vendedor_user') || '')
      if (v !== '') {
        const n = nomes[v] || v
        out.rodizio.escolhidos[n] = (out.rodizio.escolhidos[n] || 0) + 1
      }
    }

    // ---------- o Fábio ----------
    var fabioId = ''
    for (const id in nomes) {
      if (nomes[id].indexOf('Fábio') >= 0 || nomes[id].indexOf('Fabio') >= 0) fabioId = id
    }
    if (fabioId !== '') {
      var dele = []
      try {
        dele = app.findRecordsByFilter(
          app.findCollectionByNameOrId('crm_leads'),
          "owner_id='" + fabioId + "' && fixture=false",
          '',
          5000,
          0,
        )
      } catch (e3) {}
      const porDia = {}
      for (const l of dele) {
        const dia = String(l.get('created') || '').slice(0, 10)
        porDia[dia] = (porDia[dia] || 0) + 1
      }
      // últimos 5 leads dele
      dele.sort(function (a, b) {
        return String(b.get('created') || '').localeCompare(String(a.get('created') || ''))
      })
      const ultimos = []
      for (const l of dele.slice(0, 5)) {
        ultimos.push({
          nome: String(l.get('nome') || ''),
          criado: String(l.get('created') || '').slice(0, 16),
          status: String(l.get('status') || ''),
        })
      }
      out.fabio = {
        id: fabioId,
        total: dele.length,
        por_dia: porDia,
        ultimos: ultimos,
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
