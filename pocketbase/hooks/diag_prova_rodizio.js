/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA (09/11) — o rodízio só escolhe vendedor de verdade?
 *
 * Cria pedidos de rodízio **simulados** (não grava dono) e mostra quem seria
 * escolhido. Se aparecer qualquer conta de teste, gestão ou agência, a trava
 * falhou.
 *
 * GET /backend/v1/diag/prova-rodizio-trava
 */
routerAdd(
  'GET',
  '/backend/v1/diag/prova-rodizio-trava',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, elegiveis: [], pedidos: [], todos_reais: true }

    const REAIS = ['Adriana Santos', 'Fábio Teles', 'Elisangela Silva', 'Douglas Renato']

    // ---------- quem o filtro deixa passar ----------
    const nomes = {}
    const emails = {}
    try {
      for (const u of app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        '',
        '',
        300,
        0,
      )) {
        nomes[u.id] = String(u.get('name') || u.get('email') || '')
        emails[u.id] = String(u.get('email') || '').toLowerCase()
      }
    } catch (e0) {}

    const colCx = app.findCollectionByNameOrId('whatsapp_conexoes')
    for (const id in nomes) {
      const n = nomes[id]
      if (emails[id].indexOf('fixture') >= 0 || n.toLowerCase().indexOf('fixture') >= 0) continue
      if (emails[id].indexOf('josth') >= 0) continue
      // tem conexão ativa de vendedor?
      var temCx = false
      try {
        const cs = app.findRecordsByFilter(
          colCx,
          "vendedor_user='" + id + "' && papel='vendedor' && ativo=true",
          '',
          1,
          0,
        )
        temCx = cs.length > 0
      } catch (e1) {}
      if (!temCx) continue
      out.elegiveis.push(n)
    }
    out.total_elegiveis = out.elegiveis.length

    // ---------- simula 6 pedidos ----------
    const colT = app.findCollectionByNameOrId('whatsapp_transferencias')
    for (var i = 0; i < 6; i++) {
      try {
        const tr = new Record(colT)
        // usa um lead real sem dono, se houver; senão só simula a escolha
        tr.set('lead', '')
        tr.set('origem_pedido', 'botao')
        tr.set('motivo', 'primeiro_contato')
        tr.set('simulacao', true)
        tr.set('fixture', false)
        tr.set('detalhe', 'prova da trava 09/11')
        app.save(tr)
        const relido = app.findRecordById('whatsapp_transferencias', tr.id)
        const escolhido = String(relido.get('vendedor_user') || '')
        const nomeEsc = nomes[escolhido] || escolhido || '(nenhum)'
        out.pedidos.push({
          estado: String(relido.get('estado') || ''),
          escolhido: nomeEsc,
          eh_real: REAIS.indexOf(nomeEsc) >= 0,
        })
        if (REAIS.indexOf(nomeEsc) < 0 && nomeEsc !== '(nenhum)') out.todos_reais = false
        // limpa o pedido de prova
        try {
          app.delete(relido)
        } catch (eD) {}
      } catch (e2) {
        out.pedidos.push({ erro: String(e2).slice(0, 100) })
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
