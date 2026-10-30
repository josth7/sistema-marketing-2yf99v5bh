/// <reference path="../pb_data/types.d.ts" />
/**
 * Diagnóstico dos eventos do webhook (30/10) — leitura, gestão.
 *
 * GET /backend/v1/whatsapp/diag-eventos?limite=30
 *   mostra os últimos eventos recebidos da D-API com código de erro.
 * Serve para descobrir POR QUE a Meta marca as mensagens como `failed`:
 * a D-API devolve 200 no envio, mas o status final vem por webhook
 * (message.delivered / message.read / falha).
 */

routerAdd(
  'GET',
  '/backend/v1/whatsapp/diag-eventos',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    function lerLista(raw) {
      let out = []
      try {
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          out = JSON.parse(String.fromCharCode.apply(null, raw))
        } else if (typeof raw === 'string') {
          out = JSON.parse(raw)
        } else {
          out = raw || []
        }
      } catch (err) {}
      return Array.isArray(out) ? out : []
    }

    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      60,
      0,
    )
    var pode = false
    for (const g of meus) {
      const acts = lerLista(g.get('actions'))
      if (acts.indexOf('manage_atendimento') >= 0 || acts.indexOf('manage_whatsapp') >= 0)
        pode = true
    }
    if (!pode) return e.json(403, { ok: false, erro: 'sem permissão' })

    var limite = 30
    try {
      const l = Number(e.request.url.query().get('limite') || 0)
      if (l > 0 && l <= 200) limite = l
    } catch (errL) {}

    const colEv = $app.findCollectionByNameOrId('whatsapp_eventos')
    var lista = []
    try {
      lista = $app.findRecordsByFilter(colEv, '', '-created', limite, 0)
    } catch (errE) {}

    const itens = []
    for (const r of lista) {
      itens.push({
        id: r.id,
        recebido_em: String(r.get('recebido_em') || r.get('created') || ''),
        evento: String(r.get('evento') || ''),
        resultado: String(r.get('resultado') || ''),
        codigo_erro: String(r.get('codigo_erro') || ''),
        codigo_erro_len: String(r.get('codigo_erro') || '').length,
        ref_id: String(r.get('ref_id') || ''),
        trace_id: String(r.get('trace_id') || ''),
        status_pendente: String(r.get('status_pendente') || ''),
        dedupe: String(r.get('dedupe_key') || '').slice(0, 40),
      })
    }

    // resumo por evento/código (o que interessa para achar o motivo)
    const porEvento = {}
    const porCodigo = {}
    for (const i of itens) {
      porEvento[i.evento] = (porEvento[i.evento] || 0) + 1
      if (i.codigo_erro !== '')
        porCodigo[i.codigo_erro.slice(0, 120)] = (porCodigo[i.codigo_erro.slice(0, 120)] || 0) + 1
    }

    return e.json(200, { ok: true, por_evento: porEvento, por_codigo: porCodigo, itens: itens })
  },
  $apis.requireAuth(),
)
