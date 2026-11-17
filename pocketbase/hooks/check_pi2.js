/// <reference path="../pb_data/types.d.ts" />
// Prova do item 2 com o codigo REAL: cria lead com dono invalido, roda a
// transferencia e confere que NAO avisa o cliente e cria Precisa de acao.
routerAdd(
  'GET',
  '/backend/v1/check/prova-item2-real',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, passos: [], criados: [] }
    // 1. acha o consultor
    var uid = ''
    try {
      const us = app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        "email='rodrigo@adapta.org'",
        '',
        1,
        0,
      )
      if (us.length) uid = us[0].id
    } catch (e0) {}
    if (uid === '') return e.json(200, { ok: false, erro: 'consultor nao achado' })
    // 2. cria lead fixture com esse dono
    var leadId = ''
    try {
      const colL = app.findCollectionByNameOrId('crm_leads')
      const l = new Record(colL)
      l.set('nome', 'TESTE ITEM2 DONO INVALIDO')
      l.set('telefone', '5541911112222')
      l.set('status', 'entrada_lead')
      l.set('origem', 'whatsapp')
      l.set('owner_id', uid)
      l.set('fixture', true)
      app.save(l)
      leadId = l.id
      out.criados.push('lead:' + leadId.slice(0, 10))
    } catch (e1) {
      out.erro_lead = String(e1).slice(0, 120)
      return e.json(200, out)
    }
    // 3. cria o pedido de transferencia
    var trId = ''
    try {
      const colT = app.findCollectionByNameOrId('whatsapp_transferencias')
      const t = new Record(colT)
      t.set('lead', leadId)
      t.set('motivo', 'fora_do_roteiro')
      t.set('estado', 'pendente')
      t.set('fixture', true)
      app.save(t)
      trId = t.id
      out.criados.push('transferencia:' + trId.slice(0, 10))
    } catch (e2) {
      out.erro_tr = String(e2).slice(0, 120)
    }
    // 4. conta os avisos ao cliente ANTES
    var avisosAntes = 0
    try {
      avisosAntes = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        "destino_telefone='5541911112222' && motivo='aviso_cliente'",
        '',
        10,
        0,
      ).length
    } catch (e3) {}
    out.avisos_ao_cliente_antes = avisosAntes
    // 5. conta precisa_acao ANTES
    var paAntes = 0
    try {
      paAntes = app.findRecordsByFilter(
        app.findCollectionByNameOrId('precisa_acao'),
        "lead_id='" + leadId + "'",
        '',
        10,
        0,
      ).length
    } catch (e4) {}
    out.precisa_acao_antes = paAntes
    out.passos.push({
      passo: 'lead de teste criado com dono INVALIDO (consultor)',
      ok: leadId !== '',
    })
    out.passos.push({ passo: 'nenhum aviso ao cliente foi enviado', ok: avisosAntes === 0 })
    out.nota = 'a transferencia sera processada pelo hook; conferir depois com ?verificar=' + leadId
    return e.json(200, out)
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/check/prova-item2-ver',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const leadId = String(e.request.url.query().get('lead') || '')
    const out = { ok: true, passos: [] }
    if (leadId === '') return e.json(400, { ok: false, erro: 'informe ?lead=' })
    // a transferencia
    try {
      const ts = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_transferencias'),
        "lead='" + leadId + "'",
        '',
        5,
        0,
      )
      for (const t of ts)
        out.transferencia = {
          estado: String(t.get('estado') || ''),
          detalhe: String(t.get('detalhe') || '').slice(0, 120),
        }
    } catch (e1) {}
    // precisa acao
    var pa = 0
    try {
      pa = app.findRecordsByFilter(
        app.findCollectionByNameOrId('precisa_acao'),
        "lead_id='" + leadId + "'",
        '',
        5,
        0,
      ).length
    } catch (e2) {}
    out.precisa_acao_itens = pa
    // avisos
    var av = 0
    try {
      av = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        "destino_telefone='5541911112222' && motivo='aviso_cliente'",
        '',
        10,
        0,
      ).length
    } catch (e3) {}
    out.avisos_ao_cliente = av
    // o lead mudou de dono?
    try {
      const l = app.findRecordById('crm_leads', leadId)
      out.dono_atual = String(l.get('owner_id') || '')
    } catch (e4) {}
    out.passos.push({
      passo: 'estado da transferencia = dono_invalido',
      ok: (out.transferencia || {}).estado === 'dono_invalido',
    })
    out.passos.push({ passo: 'criou item em Precisa de acao', ok: pa > 0 })
    out.passos.push({ passo: 'NAO avisou o cliente', ok: av === 0 })
    out.green = out.passos.every(function (p) {
      return p.ok
    })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
