/// <reference path="../pb_data/types.d.ts" />
/**
 * TESTE DE ENTREGA (04/11) — a Meta entrega?
 *
 * O dono disse que os clientes não recebem. A fila diz "enviado" porque a
 * D-API devolve 200. Esta rota faz o envio pelo MESMO caminho da produção
 * (chave e sessão da central) e devolve a RESPOSTA CRUA da D-API — status e
 * corpo completos. Se a Meta recusar, o motivo aparece aqui, não se adivinha.
 *
 * Só gestão. Só manda para número INTERNO (nunca para cliente).
 *
 * GET /backend/v1/diag/teste-entrega?destino=5541XXXXXXXXX
 */
routerAdd(
  'GET',
  '/backend/v1/diag/teste-entrega',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'sem sessão' })

    const out = { passo: '', ok: false, dapi_status: 0, dapi_corpo: '', detalhe: '' }

    // ---------- guard: gestão ----------
    var gestao = false
    try {
      const gs = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        30,
        0,
      )
      for (const g of gs) {
        var a = []
        try {
          const raw = g.get('actions')
          a =
            Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, raw))
              : typeof raw === 'string'
                ? JSON.parse(raw)
                : raw || []
        } catch (eA) {}
        if (Array.isArray(a) && a.indexOf('manage_atendimento') >= 0) gestao = true
      }
    } catch (eG) {}
    if (!gestao) return e.json(403, { ok: false, erro: 'só a gestão' })

    // ---------- destino: número INTERNO somente ----------
    const destino = String(e.request.queryParam('destino') || '').replace(/\D/g, '')
    if (destino === '') return e.json(422, { ok: false, erro: 'informe ?destino=' })

    var internos = []
    try {
      const colCfg = $app.findCollectionByNameOrId('atendimento_config')
      const vs = $app.findRecordsByFilter(colCfg, '', '', 500, 0)
      var cfg = null
      for (const v of vs) {
        if (!cfg || Number(v.get('versao') || 0) > Number(cfg.get('versao') || 0)) cfg = v
      }
      if (cfg) {
        var raw = cfg.get('internos')
        internos =
          Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number'
            ? JSON.parse(String.fromCharCode.apply(null, raw))
            : typeof raw === 'string'
              ? JSON.parse(raw)
              : raw || []
      }
    } catch (eI) {}

    var ehInterno = false
    for (const i of internos) {
      if (String(i.numero || '') === destino) ehInterno = true
    }
    if (!ehInterno) {
      return e.json(422, {
        ok: false,
        erro: 'destino precisa ser um número interno da equipe (proteção do cliente)',
        permitidos: internos.map(function (i) {
          return { numero: String(i.numero || ''), rotulo: String(i.rotulo || '') }
        }),
      })
    }

    // ---------- conexão central ----------
    var central = null
    try {
      const cxs = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true",
        '',
        5,
        0,
      )
      if (cxs.length > 0) central = cxs[0]
    } catch (eC) {}
    if (!central) return e.json(422, { ok: false, erro: 'sem conexão central ativa' })

    out.passo = 'conexao'
    out.conexao = String(central.get('numero') || '')
    out.session_id = String(central.get('session_id') || '')

    // ---------- chave (a mesma que a fila usa) ----------
    const secao = String(central.get('nome_segredo_chave') || 'DAPI_API_KEY')
    var chave = ''
    try {
      chave = String($secrets.get(secao) || '')
    } catch (eS) {}
    out.chave_encontrada = chave !== ''
    out.secao_chave = secao
    if (chave === '') return e.json(200, out)

    // ---------- envia de verdade ----------
    out.passo = 'envio'
    const texto =
      'Teste de entrega do sistema Haisan (' +
      new Date().toISOString().slice(0, 19) +
      '). Se você recebeu esta mensagem, a Meta está entregando.'

    var status = 0
    var corpo = ''
    try {
      const resp = $http.send({
        url: 'https://api.d-api.cloud/api/v1/messages/send/text',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: chave },
        body: JSON.stringify({
          sessionId: String(central.get('session_id') || ''),
          to: destino,
          text: texto,
        }),
        timeout: 15,
      })
      status = Number(resp.statusCode || 0)
      var rawB = resp.body
      if (Array.isArray(rawB)) corpo = String.fromCharCode.apply(null, rawB)
      else if (typeof rawB === 'string') corpo = rawB
    } catch (eH) {
      out.passo = 'transporte'
      out.detalhe = String(eH).slice(0, 200)
      return e.json(200, out)
    }

    out.dapi_status = status
    out.dapi_corpo = corpo.slice(0, 600)
    out.ok = status >= 200 && status < 300
    out.destino = destino
    out.texto_enviado = texto
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
