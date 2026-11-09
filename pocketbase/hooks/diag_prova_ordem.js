/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA (09/11) — a ordem fixa do rodízio.
 *
 * Cria pedidos de rodízio SIMULADOS em sequência e mostra quem é escolhido.
 * A ordem deve ser, ciclicamente:
 *
 *   Adriana → Douglas → Elisângela → Fábio → Adriana → ...
 *
 * Os pedidos de prova são apagados no fim.
 *
 * GET /backend/v1/diag/prova-ordem
 */
routerAdd(
  'GET',
  '/backend/v1/diag/prova-ordem',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, ordem: [], esperado: [], bate: true }

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

    const colT = app.findCollectionByNameOrId('whatsapp_transferencias')
    const criados = []

    // cria 8 pedidos simulados: a ordem deve se repetir duas vezes
    for (var i = 0; i < 8; i++) {
      try {
        const tr = new Record(colT)
        tr.set('lead', '')
        tr.set('origem_pedido', 'botao')
        tr.set('motivo', 'primeiro_contato')
        // simulacao=false para gravar a escolha como pedido real de rodízio,
        // mas sem lead — não afeta nenhum cliente
        tr.set('simulacao', false)
        tr.set('fixture', false)
        tr.set('detalhe', 'prova da ordem 09/11')
        app.save(tr)
        criados.push(tr.id)
        const relido = app.findRecordById('whatsapp_transferencias', tr.id)
        const escolhido = String(relido.get('vendedor_user') || '')
        out.ordem.push({
          passo: i + 1,
          quem: nomes[escolhido] || '(nenhum)',
          estado: String(relido.get('estado') || ''),
        })
      } catch (e1) {
        out.ordem.push({ passo: i + 1, erro: String(e1).slice(0, 80) })
      }
    }

    // o esperado: ciclo
    const ciclo = ['Adriana Santos', 'Douglas Renato', 'Elisangela Silva', 'Fábio Teles']
    // a sequência real começa de onde o último pedido deixou; compara como ciclo
    for (var k = 0; k < out.ordem.length; k++) {
      const real = out.ordem[k].quem || ''
      // aceita desde que cada um apareça em ordem cíclica
      if (ciclo.indexOf(real) < 0) out.bate = false
    }
    // confere se a sequência é cíclica (cada passo = anterior + 1 na lista)
    for (var j = 1; j < out.ordem.length; j++) {
      const ant = ciclo.indexOf(out.ordem[j - 1].quem || '')
      const at = ciclo.indexOf(out.ordem[j].quem || '')
      if (ant >= 0 && at >= 0 && at !== (ant + 1) % ciclo.length) out.bate = false
    }
    out.esperado = ciclo

    // limpa
    for (const id of criados) {
      try {
        app.delete(app.findRecordById('whatsapp_transferencias', id))
      } catch (e2) {}
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
