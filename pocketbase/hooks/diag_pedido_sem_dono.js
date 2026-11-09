/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (09/11) — o pedido de rodízio existe, mas o dono não foi gravado.
 *
 * **SÓ LEITURA.** Para os leads sem dono que têm pedido, mostra:
 *   - o estado do pedido (pendente / aplicado / erro);
 *   - se o pedido tem vendedor escolhido;
 *   - o resultado gravado;
 *   - a hora do pedido e a hora do lead.
 *
 * A hipótese: o pedido foi criado mas o aplicador não rodou, ou rodou e falhou
 * em silêncio (o padrão de save sem erro que já me pegou várias vezes).
 *
 * GET /backend/v1/diag/pedido-sem-dono
 */
routerAdd(
  'GET',
  '/backend/v1/diag/pedido-sem-dono',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = {
      ok: true,
      pedidos: 0,
      por_estado: {},
      por_origem_pedido: {},
      sem_vendedor: 0,
      com_resultado: 0,
      itens: [],
    }

    var trs = []
    try {
      trs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_transferencias'),
        '',
        '',
        6000,
        0,
      )
    } catch (e0) {
      return e.json(200, { ok: false, erro: String(e0).slice(0, 140) })
    }

    // leads sem dono
    const semDono = {}
    try {
      for (const l of app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false',
        '',
        12000,
        0,
      )) {
        if (String(l.get('owner_id') || '') !== '') continue
        if (String(l.get('status') || '') === 'descartado') continue
        semDono[l.id] = l
      }
    } catch (e1) {}

    for (const t of trs) {
      const lid = String(t.get('lead') || '')
      if (!semDono[lid]) continue

      out.pedidos++
      const est = String(t.get('estado') || '(vazio)')
      out.por_estado[est] = (out.por_estado[est] || 0) + 1
      const org = String(t.get('origem_pedido') || '(vazio)')
      out.por_origem_pedido[org] = (out.por_origem_pedido[org] || 0) + 1
      const vend = String(t.get('vendedor_user') || '') || String(t.get('vendedor_escolhido') || '')
      if (vend === '') out.sem_vendedor++
      const res = String(t.get('resultado') || '')
      if (res !== '') out.com_resultado++

      if (out.itens.length < 12) {
        out.itens.push({
          lead: lid,
          estado: est,
          origem_pedido: org,
          vendedor: vend.slice(0, 15),
          resultado: res.slice(0, 60),
          tentativas: Number(t.get('tentativas') || 0),
          criado: String(t.get('created') || '').slice(0, 16),
          atualizado: String(t.get('updated') || '').slice(0, 16),
        })
      }
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
