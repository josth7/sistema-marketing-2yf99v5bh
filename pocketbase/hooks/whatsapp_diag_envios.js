/// <reference path="../pb_data/types.d.ts" />
/**
 * Diagnóstico da fila de envios (30/10) — leitura, só para gestão.
 *
 * GET /backend/v1/whatsapp/diag-envios
 *   mostra os últimos envios com estado, motivo, erro e se a chave foi achada.
 * Existe porque a prova do vendedor mostrou o envio criado e o cron rodando
 * sem pegá-lo — preciso ver o registro, não adivinhar.
 */

routerAdd(
  'GET',
  '/backend/v1/whatsapp/diag-envios',
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

    const colEnv = $app.findCollectionByNameOrId('whatsapp_envios')

    // quantos existem por estado (prova objetiva de que o registro está lá)
    const contagem = {}
    for (const est of ['pendente', 'erro', 'enviado', 'erro_definitivo', 'sem_numero']) {
      try {
        const l = $app.findRecordsByFilter(colEnv, 'estado="' + est + '"', '', 500, 0)
        contagem[est] = l ? l.length : 0
      } catch (err) {
        contagem[est] = -1
      }
    }

    var lista = []
    try {
      lista = $app.findRecordsByFilter(colEnv, '', '-created', 12, 0)
    } catch (errL) {}

    const itens = []
    for (const r of lista) {
      var temChave = false
      var secao = ''
      try {
        const cx = $app.findRecordById('whatsapp_conexoes', String(r.get('conexao')))
        secao = String(cx.get('nome_segredo_chave') || '')
        var k = ''
        try {
          k = String($secrets.get(secao) || '')
        } catch (e1) {}
        if (k === '') {
          try {
            k = String($secrets.get('DAPI_USER_KEY') || '')
          } catch (e2) {}
        }
        temChave = k !== ''
      } catch (errCx) {}
      itens.push({
        id: r.id,
        created: String(r.get('created') || ''),
        motivo: r.get('motivo'),
        estado: r.get('estado'),
        tentativas: r.get('tentativas'),
        ultimo_erro: String(r.get('ultimo_erro') || ''),
        destino: String(r.get('destino_telefone') || ''),
        tem_midia: String(r.get('midia') || '') !== '',
        secao: secao,
        chave_encontrada: temChave,
        texto: String(r.get('texto') || '').slice(0, 40),
      })
    }

    return e.json(200, {
      ok: true,
      contagem: contagem,
      total_ultimos: itens.length,
      itens: itens,
    })
  },
  $apis.requireAuth(),
)
