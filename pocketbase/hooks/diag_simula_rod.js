/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (09/11) — quem o rodízio escolheria agora?
 *
 * Recalcula a carga em aberto (a mesma que o rodízio usa) e mostra o ranking
 * de menor carga. Se o ranking não explicar a distribuição real (45/31/12/6),
 * o defeito está em outro ponto do fluxo.
 *
 * GET /backend/v1/diag/simula-rodizio
 */
routerAdd(
  'GET',
  '/backend/v1/diag/simula-rodizio',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, total_leads: 0, ranking_menor_carga: [] }

    var todos = []
    try {
      todos = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        5000,
        0,
      )
    } catch (e0) {
      return e.json(200, { ok: false, erro: String(e0).slice(0, 140) })
    }
    out.total_leads = todos.length

    const ENC = {
      venda_realizada: 1,
      producao: 1,
      finalizado: 1,
      descartado: 1,
      fechado: 1,
      perdido: 1,
    }
    const carga = {}
    for (const l of todos) {
      const ow = String(l.get('owner_id') || '')
      if (ow === '') continue
      const st = String(l.get('status') || 'entrada_lead')
      if (ENC[st]) continue
      carga[ow] = (carga[ow] || 0) + 1
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
    } catch (e1) {}

    const lista = []
    for (const id in carga) {
      const n = nomes[id] || id
      lista.push({ nome: n.slice(0, 22), carga: carga[id] })
    }
    lista.sort(function (a, b) {
      return a.carga - b.carga
    })
    out.ranking_menor_carga = lista
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
