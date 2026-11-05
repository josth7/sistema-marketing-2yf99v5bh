/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (05/11) — por que um lead ficou sem dono com a conversa em
 * `transferida`?
 *
 * A Fabíola (hoje) ficou: conversa `transferida`, lead `entrada_lead` e
 * `owner_id` vazio. Se o ponto único recebeu o pedido, ele deveria ter gravado
 * o dono. Preciso ver o PEDIDO e o estado dele.
 *
 * GET /backend/v1/diag/transferencia?lead=<id>
 */
routerAdd(
  'GET',
  '/backend/v1/diag/transferencia',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const lead = String(e.request.url.query().get('lead') || '')
    if (lead === '') return e.json(422, { ok: false, erro: 'informe ?lead=' })

    const out = { lead: lead, pedidos: [], lead_dados: null }

    var trs = []
    try {
      trs = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_transferencias'),
        "lead='" + lead + "'",
        '',
        50,
        0,
      )
    } catch (e0) {
      out.erro = String(e0).slice(0, 160)
    }

    for (const t of trs) {
      out.pedidos.push({
        id: t.id,
        motivo: String(t.get('motivo') || ''),
        origem_pedido: String(t.get('origem_pedido') || ''),
        regra: String(t.get('regra') || ''),
        estado: String(t.get('estado') || ''),
        detalhe: String(t.get('detalhe') || '').slice(0, 90),
        vendedor_user: String(t.get('vendedor_user') || '').slice(0, 12),
        vendedor_nome: String(t.get('vendedor_nome') || ''),
        simulacao: String(t.get('simulacao')) === 'true',
        criado: String(t.get('created') || '').slice(0, 19),
      })
    }

    try {
      const l = $app.findRecordById('crm_leads', lead)
      out.lead_dados = {
        nome: String(l.get('nome') || ''),
        telefone: String(l.get('telefone') || ''),
        status: String(l.get('status') || ''),
        owner_id: String(l.get('owner_id') || ''),
        vendedor_nome: String(l.get('vendedor_nome') || ''),
        fixture: String(l.get('fixture')) === 'true',
        criado: String(l.get('created') || '').slice(0, 19),
      }
    } catch (e1) {
      out.erro_lead = String(e1).slice(0, 140)
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
