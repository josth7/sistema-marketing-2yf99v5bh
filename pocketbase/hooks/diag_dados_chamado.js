/// <reference path="../pb_data/types.d.ts" />
/**
 * DADOS PARA O CHAMADO D-API (10/11) — 130497 por número.
 *
 * Levanta, para cada número da Haisan: o identificador da conexão na D-API, o
 * número, o WABA e o último resultado de envio (entregue ou restrito).
 *
 * É o que o suporte precisa para agir sem pedir mais informação.
 *
 * GET /backend/v1/diag/dados-chamado
 */
routerAdd(
  'GET',
  '/backend/v1/diag/dados-chamado',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, numeros: [], resumo: '' }

    var cxs = []
    try {
      cxs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        'ativo=true',
        '',
        40,
        0,
      )
    } catch (e0) {
      return e.json(200, { ok: false, erro: String(e0).slice(0, 120) })
    }

    // última falha e última entrega por conexão
    const ultimaFalha = {}
    const ultimaEntrega = {}
    try {
      const evs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_eventos'),
        "created>='2026-11-09'",
        '',
        2000,
        0,
      )
      for (const ev of evs) {
        const tipo = String(ev.get('evento') || '')
        const q = String(ev.get('recebido_em') || ev.get('created') || '')
        const cod = String(ev.get('codigo_erro') || '')
        // o evento não guarda a conexão: deduz pelo wamid na mensagem
        const ref = String(ev.get('ref_id') || '')
        if (ref === '') continue
        var cxId = ''
        try {
          const ms = app.findRecordsByFilter(
            app.findCollectionByNameOrId('whatsapp_mensagens'),
            "wa_message_id='" + ref + "'",
            '',
            1,
            0,
          )
          if (ms && ms.length > 0) cxId = String(ms[0].get('conexao') || '')
        } catch (e1) {}
        if (cxId === '') continue
        if (tipo === 'message.failed') {
          if (!ultimaFalha[cxId] || q > ultimaFalha[cxId].q) {
            ultimaFalha[cxId] = { q: q, cod: cod.slice(0, 70) }
          }
        }
        if (tipo === 'message.delivered') {
          if (!ultimaEntrega[cxId] || q > ultimaEntrega[cxId].q) {
            ultimaEntrega[cxId] = { q: q }
          }
        }
      }
    } catch (e2) {}

    var restritos = 0
    var ok = 0
    for (const c of cxs) {
      const nome = String(c.get('nome_exibicao') || '')
      if (nome.toLowerCase().indexOf('fixture') >= 0) continue
      const fal = ultimaFalha[c.id]
      const ent = ultimaEntrega[c.id]
      var situacao = 'sem evento recente'
      if (fal && ent) situacao = fal.q > ent.q ? 'RESTRITO' : 'entregando'
      else if (fal) situacao = 'RESTRITO'
      else if (ent) situacao = 'entregando'
      if (situacao === 'RESTRITO') restritos++
      if (situacao === 'entregando') ok++
      out.numeros.push({
        nome: nome,
        numero: String(c.get('numero') || ''),
        papel: String(c.get('papel') || ''),
        session_id: String(c.get('session_id') || ''),
        situacao: situacao,
        codigo_falha: fal ? fal.cod : '',
        ultima_falha: fal ? String(fal.q).slice(0, 16) : '',
        ultima_entrega: ent ? String(ent.q).slice(0, 16) : '',
      })
    }

    out.resumo = ok + ' entregando · ' + restritos + ' restrito(s)'
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
