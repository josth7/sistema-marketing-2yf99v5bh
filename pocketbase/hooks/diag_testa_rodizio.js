/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (09/11) — o fluxo de transferência grava o dono?
 *
 * **Teste controlado:** pega um lead REAL sem dono, cria o pedido de rodízio
 * (igual ao que a IA faz), deixa o hook rodar e depois verifica se o dono foi
 * gravado. **Se gravar, devolve ao estado original** (o lead continua sem dono).
 *
 * É isso que separa "o código está errado" de "o hook não roda".
 *
 * GET /backend/v1/diag/testa-rodizio?lead=<id>
 */
routerAdd(
  'GET',
  '/backend/v1/diag/testa-rodizio',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const leadId = String(e.request.url.query().get('lead') || '')
    const out = { ok: true, passos: [] }

    var lead = null
    try {
      lead = app.findRecordById('crm_leads', leadId)
    } catch (e0) {
      return e.json(404, { ok: false, erro: 'lead não encontrado' })
    }
    if (String(lead.get('owner_id') || '') !== '') {
      return e.json(422, { ok: false, erro: 'este lead JÁ tem dono; escolha um sem dono' })
    }

    // cria o pedido igual ao da IA
    var trId = ''
    try {
      const colTr = app.findCollectionByNameOrId('whatsapp_transferencias')
      const tr = new Record(colTr)
      tr.set('lead', leadId)
      tr.set('origem_pedido', 'ia')
      tr.set('motivo', 'primeiro_contato')
      tr.set('simulacao', false)
      tr.set('fixture', false)
      tr.set('detalhe', 'diagnostico 09/11')
      app.save(tr)
      trId = tr.id
      out.passos.push({ passo: '1. pedido criado', ok: true, detalhe: tr.id })
    } catch (e1) {
      return e.json(500, { ok: false, erro: 'criar pedido: ' + String(e1).slice(0, 150) })
    }

    // lê o pedido e o lead depois do hook
    var trDepois = null
    var leadDepois = null
    try {
      trDepois = app.findRecordById('whatsapp_transferencias', trId)
      leadDepois = app.findRecordById('crm_leads', leadId)
    } catch (e2) {}

    const ownerAgora = leadDepois ? String(leadDepois.get('owner_id') || '') : ''
    out.passos.push({
      passo: '2. dono gravado pelo hook?',
      ok: ownerAgora !== '',
      detalhe: 'owner=[' + ownerAgora + ']',
    })
    if (trDepois) {
      out.pedido = {
        id: trDepois.id,
        estado: String(trDepois.get('estado') || ''),
        vendedor_user: String(trDepois.get('vendedor_user') || ''),
        vendedor_nome: String(trDepois.get('vendedor_nome') || ''),
        regra: String(trDepois.get('regra') || ''),
        detalhe: String(trDepois.get('detalhe') || ''),
        envios: String(trDepois.get('envios') || ''),
      }
      out.passos.push({
        passo: '3. estado do pedido',
        ok: true,
        detalhe:
          'estado=' +
          out.pedido.estado +
          ' regra=' +
          out.pedido.regra +
          ' detalhe=' +
          out.pedido.detalhe,
      })
    }

    // se gravou, devolve
    if (ownerAgora !== '') {
      try {
        leadDepois.set('owner_id', '')
        app.save(leadDepois)
        out.passos.push({
          passo: '4. revertido (lead volta a ficar sem dono)',
          ok: true,
          detalhe: 'owner limpo',
        })
      } catch (e3) {
        out.passos.push({
          passo: '4. REVERTER',
          ok: false,
          detalhe: 'FALHOU: ' + String(e3).slice(0, 120),
        })
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
