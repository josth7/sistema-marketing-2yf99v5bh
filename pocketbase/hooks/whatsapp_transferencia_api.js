/// <reference path="../pb_data/types.d.ts" />
/**
 * Transferência de lead e fila de envios (SPEC-3-005, CA-3-16).
 *
 * Rotas:
 *   POST /backend/v1/whatsapp/leads/{id}/transferir   (manage_leads)
 *        {motivo?, simulacao?} → cria o pedido; o hook executa a RN-67
 *   GET  /backend/v1/whatsapp/leads/{id}/transferencias  histórico do lead
 *   GET  /backend/v1/whatsapp/envios                     fila (read_conversas)
 *   POST /backend/v1/whatsapp/envios/{id}/tentar         forçar nova tentativa
 *
 * O envio real para a D-API mora no hook whatsapp_envios_fila.js.
 * JSVM: lógica INLINE nos callbacks.
 */

routerAdd(
  'POST',
  '/backend/v1/whatsapp/leads/{id}/transferir',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      60,
      0,
    )
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
      } catch (e) {}
      return Array.isArray(out) ? out : []
    }
    var temManage = false
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
      if (ate !== '' && ate.slice(0, 10) < hoje) continue
      const acts = lerLista(g.get('actions'))
      if (acts.indexOf('manage_leads') >= 0) temManage = true
    }
    if (!temManage) {
      return e.json(403, { ok: false, erro: 'sem permissão para transferir lead (manage_leads)' })
    }

    let lead
    try {
      lead = $app.findRecordById('crm_leads', e.request.pathValue('id'))
    } catch (_) {
      return e.json(404, { ok: false, erro: 'lead não encontrado' })
    }
    // `e.auth.email` não vem preenchido no record de auth do JSVM — ler do
    // banco. Sem isto o usuário de teste nunca é reconhecido como fixture e
    // recebe 404 nos próprios leads (bug real encontrado no teste de 28/10).
    var emailAuth = ''
    try {
      emailAuth = String($app.findRecordById('users', e.auth.id).get('email') || '')
    } catch (eA) {}
    const ehFixture = emailAuth.indexOf('fixture') >= 0
    const leadFixture = String(lead.get('fixture')) === 'true'
    if (leadFixture !== ehFixture) {
      return e.json(404, { ok: false, erro: 'lead não encontrado' })
    }

    const body = e.requestInfo().body || {}
    const motivo = String(body.motivo || 'primeiro_contato').trim()
    const validos = [
      'primeiro_contato',
      'ja_cliente',
      'pediu_humano',
      'humor_negativo',
      'fora_do_roteiro',
      'falha_ia',
      'manutencao',
    ]
    if (validos.indexOf(motivo) < 0) {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { motivo: 'motivo desconhecido' },
      })
    }

    const colTr = $app.findCollectionByNameOrId('whatsapp_transferencias')
    const pedido = new Record(colTr)
    pedido.set('lead', lead.id)
    pedido.set('origem_pedido', String(body.origem_pedido || 'botao'))
    pedido.set('motivo', motivo)
    pedido.set('simulacao', body.simulacao === true)
    pedido.set('estado', 'pendente')
    pedido.set('criado_por', e.auth.id)
    pedido.set('fixture', ehFixture)
    $app.save(pedido)

    // o hook onRecordAfterCreateSuccess já executou (RN-67); reler para
    // devolver o resultado de verdade, não o pedido em aberto
    let resultado = pedido
    try {
      resultado = $app.findRecordById('whatsapp_transferencias', pedido.id)
    } catch (eR) {}

    return e.json(200, {
      ok: true,
      id: resultado.id,
      vendedor_user: resultado.get('vendedor_user'),
      vendedor_nome: resultado.get('vendedor_nome'),
      regra: resultado.get('regra'),
      estado: resultado.get('estado'),
      envios: resultado.get('envios'),
      detalhe: resultado.get('detalhe'),
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/whatsapp/leads/{id}/transferencias',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    let lead
    try {
      lead = $app.findRecordById('crm_leads', e.request.pathValue('id'))
    } catch (_) {
      return e.json(404, { ok: false, erro: 'lead não encontrado' })
    }
    const colTr = $app.findCollectionByNameOrId('whatsapp_transferencias')
    const colEnv = $app.findCollectionByNameOrId('whatsapp_envios')
    const regs = $app.findRecordsByFilter(colTr, "lead='" + lead.id + "'", '', 50, 0)
    const itens = []
    for (const t of regs) {
      var enviosDetalhe = []
      try {
        const ids = t.get('envios')
        var lista = []
        if (Array.isArray(ids) && ids.length > 0 && typeof ids[0] === 'number') {
          lista = JSON.parse(String.fromCharCode.apply(null, ids))
        } else if (Array.isArray(ids)) {
          lista = ids
        }
        for (const id of lista) {
          try {
            const env = $app.findRecordById('whatsapp_envios', String(id))
            enviosDetalhe.push({
              id: env.id,
              motivo: env.get('motivo'),
              modo: env.get('modo'),
              estado: env.get('estado'),
              tentativas: env.get('tentativas'),
              destino: env.get('destino_telefone'),
              texto: env.get('texto'),
            })
          } catch (eE) {}
        }
      } catch (eP) {}
      itens.push({
        id: t.id,
        vendedor_nome: t.get('vendedor_nome'),
        regra: t.get('regra'),
        estado: t.get('estado'),
        simulacao: String(t.get('simulacao')) === 'true',
        detalhe: t.get('detalhe'),
        envios: enviosDetalhe,
      })
    }
    return e.json(200, { ok: true, total: itens.length, itens: itens })
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/whatsapp/envios',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      60,
      0,
    )
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
      } catch (e) {}
      return Array.isArray(out) ? out : []
    }
    var tem = false
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
      if (ate !== '' && ate.slice(0, 10) < hoje) continue
      const acts = lerLista(g.get('actions'))
      if (acts.indexOf('read_conversas') >= 0) tem = true
    }
    if (!tem) return e.json(403, { ok: false, erro: 'sem permissão (read_conversas)' })

    const colEnv = $app.findCollectionByNameOrId('whatsapp_envios')
    const ehFixture = String(e.auth.email || '').indexOf('.fixture.') >= 0
    const regs = $app.findRecordsByFilter(
      colEnv,
      'fixture=' + (ehFixture ? 'true' : 'false'),
      '',
      300,
      0,
    )
    const itens = []
    const contagem = {}
    for (const v of regs) {
      const est = String(v.get('estado') || 'pendente')
      contagem[est] = (contagem[est] || 0) + 1
      itens.push({
        id: v.id,
        lead: v.get('lead'),
        destino: v.get('destino_telefone'),
        motivo: v.get('motivo'),
        modo: v.get('modo'),
        estado: est,
        tentativas: v.get('tentativas'),
        ultimo_erro: v.get('ultimo_erro'),
        criado_em: String(v.get('created') || ''),
      })
    }
    return e.json(200, { ok: true, total: itens.length, por_estado: contagem, itens: itens })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/whatsapp/envios/{id}/tentar',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    let env
    try {
      env = $app.findRecordById('whatsapp_envios', e.request.pathValue('id'))
    } catch (_) {
      return e.json(404, { ok: false, erro: 'envio não encontrado' })
    }
    const est = String(env.get('estado') || '')
    if (est === 'enviado') {
      return e.json(422, { ok: false, erro: 'envio já concluído' })
    }
    if (est === 'erro_definitivo') {
      return e.json(422, {
        ok: false,
        erro: 'envio em erro definitivo',
        detalhe: 'reenvio manual exige revisar o destino',
      })
    }
    env.set('estado', 'pendente')
    env.set('tentativas', 0)
    $app.save(env)
    return e.json(200, { ok: true, id: env.id, estado: 'pendente' })
  },
  $apis.requireAuth(),
)
