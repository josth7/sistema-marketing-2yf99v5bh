/// <reference path="../pb_data/types.d.ts" />
/**
 * TESTE (10/11) — o ponto único grava o dono num dos 4 leads?
 *
 * Pega o lead `Cícero Alves` (sem pedido) e cria o pedido, depois relê para ver
 * se o dono foi gravado. Se gravar, os outros 4 são pedidos antigos.
 *
 * GET /backend/v1/diag/testa-um
 */
routerAdd(
  'GET',
  '/backend/v1/diag/testa-um',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true }

    // acha o lead sem pedido
    var alvo = null
    try {
      const leads = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        12000,
        0,
      )
      for (const l of leads) {
        if (String(l.get('owner_id') || '') !== '') continue
        if (String(l.get('status') || '') === 'descartado') continue
        const trs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_transferencias'),
          "lead='" + l.id + "'",
          '',
          3,
          0,
        )
        // pega o primeiro sem dono, com ou sem pedido
        alvo = l
        break
      }
    } catch (e0) {}
    if (!alvo) return e.json(200, { ok: false, erro: 'nenhum lead sem pedido' })

    out.lead = String(alvo.get('nome') || '').slice(0, 16)

    // cria o pedido
    try {
      const tr = new Record(app.findCollectionByNameOrId('whatsapp_transferencias'))
      tr.set('lead', alvo.id)
      tr.set('origem_pedido', 'botao')
      tr.set('motivo', 'primeiro_contato')
      tr.set('simulacao', false)
      tr.set('fixture', false)
      tr.set('detalhe', 'teste 10/11')
      app.save(tr)
      out.pedido = tr.id
    } catch (e1) {
      return e.json(200, { ok: false, erro: 'pedido: ' + String(e1).slice(0, 120) })
    }

    // relê o lead e o pedido
    try {
      const l2 = app.findRecordById('crm_leads', alvo.id)
      out.dono = String(l2.get('owner_id') || '(vazio)')
    } catch (e2) {}
    try {
      const trs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_transferencias'),
        "lead='" + alvo.id + "'",
        '',
        5,
        0,
      )
      const lst = []
      for (const t of trs) {
        lst.push({
          estado: String(t.get('estado') || ''),
          detalhe: String(t.get('detalhe') || '').slice(0, 60),
        })
      }
      out.pedidos = lst
    } catch (e3) {}

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
