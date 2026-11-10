/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (10/11) — por que os 4 leads novos não receberam dono?
 *
 * O cron roda (log confirma), lê 1.966 leads e distribui 0. Os 4 sem dono
 * foram criados entre 09/11 22h e 10/11 08h49.
 *
 * Aqui se mostra, para cada um: tem pedido? qual o estado? o vendedor existe?
 *
 * GET /backend/v1/diag/os-quatro
 */
routerAdd(
  'GET',
  '/backend/v1/diag/os-quatro',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, itens: [] }

    var leads = []
    try {
      leads = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        12000,
        0,
      )
    } catch (e0) {
      return e.json(200, { ok: false, erro: String(e0).slice(0, 140) })
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
        nomes[u.id] = String(u.get('name') || '')
      }
    } catch (e1) {}

    for (const l of leads) {
      if (String(l.get('owner_id') || '') !== '') continue
      if (String(l.get('status') || '') === 'descartado') continue

      var pedidos = []
      try {
        const trs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_transferencias'),
          "lead='" + l.id + "'",
          '',
          5,
          0,
        )
        for (const t of trs) {
          const v = String(t.get('vendedor_user') || '')
          pedidos.push({
            estado: String(t.get('estado') || ''),
            vendedor: nomes[v] || v.slice(0, 8) || '(vazio)',
            detalhe: String(t.get('detalhe') || '').slice(0, 50),
            criado: String(t.get('created') || '').slice(0, 16),
          })
        }
      } catch (e2) {}

      out.itens.push({
        nome: String(l.get('nome') || '').slice(0, 18),
        criado: String(l.get('created') || '').slice(0, 16),
        status: String(l.get('status') || ''),
        pedidos: pedidos,
      })
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
