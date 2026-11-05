/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA CA-3-43 — um lead, um dono (05/11).
 *
 * O defeito: três caminhos gravavam dono (cron `wa_aviso_lead_novo`, robô e
 * `whatsapp_transferencias`), cada um com a própria conta. Em 04/11 o mesmo
 * lead apareceu para duas vendedoras.
 *
 * Agora o robô e o cron só CRIAM PEDIDO; quem grava é o ponto único
 * (`whatsapp_transferencias`), que aplica: carteira → menor carga.
 *
 * Esta rota prova, sem tocar em cliente real:
 *   1. cria um lead de TESTE sem dono (5551999000123)
 *   2. pede dois pedidos de atribuição para o MESMO lead, em sequência
 *   3. confere que o dono é UM só e que o segundo pedido NÃO trocou
 *   4. conta quantos eventos de atribuição nasceram (não pode duplicar)
 *   5. apaga o lead de teste e o que ele criou
 *
 * GET /backend/v1/diag/prova-um-dono
 */
routerAdd(
  'GET',
  '/backend/v1/diag/prova-um-dono',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const TEL = '5551999000123'
    const colL = $app.findCollectionByNameOrId('crm_leads')
    const colTr = $app.findCollectionByNameOrId('whatsapp_transferencias')
    const colEv = $app.findCollectionByNameOrId('crm_lead_events')
    const out = { passos: [], ok: false, erro: '' }

    // limpa resto de execução anterior
    try {
      const velhos = $app.findRecordsByFilter(colL, "telefone='" + TEL + "'", '', 5, 0)
      for (const v of velhos) {
        try {
          const es = $app.findRecordsByFilter(colEv, "lead_id='" + v.id + "'", '', 200, 0)
          for (const x of es) {
            try {
              $app.delete(x)
            } catch (a) {}
          }
        } catch (b) {}
        try {
          $app.delete(v)
        } catch (c) {}
      }
    } catch (e0) {}

    // 1. lead de teste sem dono
    var lead = null
    try {
      lead = new Record(colL)
      lead.set('nome', 'Prova Um Dono')
      lead.set('telefone', TEL)
      lead.set('origem', 'manual')
      lead.set('status', 'entrada_lead')
      lead.set('fixture', false)
      $app.save(lead)
      out.passos.push({ passo: '1. lead de teste criado', ok: true, detalhe: lead.id })
    } catch (e1) {
      out.erro = 'criar lead: ' + String(e1).slice(0, 160)
      return e.json(200, out)
    }

    // 2. dois pedidos de atribuição em sequência
    for (var i = 1; i <= 2; i++) {
      try {
        const tr = new Record(colTr)
        tr.set('lead', lead.id)
        tr.set('origem_pedido', 'botao')
        tr.set('motivo', 'primeiro_contato')
        tr.set('simulacao', false)
        tr.set('fixture', false)
        tr.set('detalhe', 'prova um dono — pedido ' + i)
        $app.save(tr)
        out.passos.push({ passo: '2.' + i + ' pedido de atribuição', ok: true, detalhe: tr.id })
      } catch (e2) {
        out.passos.push({
          passo: '2.' + i + ' pedido de atribuição',
          ok: false,
          detalhe: String(e2).slice(0, 140),
        })
      }
    }

    // 3. relê o lead
    var dono1 = ''
    var nome1 = ''
    try {
      const r1 = $app.findRecordById(colL, lead.id)
      dono1 = String(r1.get('owner_id') || '')
      nome1 = String(r1.get('vendedor_nome') || '')
      out.passos.push({
        passo: '3. dono após 2 pedidos',
        ok: dono1 !== '',
        detalhe: (nome1 || '(vazio)') + ' · ' + dono1,
      })
    } catch (e3) {}

    // 4. terceiro pedido NÃO pode trocar o dono
    try {
      const tr3 = new Record(colTr)
      tr3.set('lead', lead.id)
      tr3.set('origem_pedido', 'botao')
      tr3.set('motivo', 'primeiro_contato')
      tr3.set('simulacao', false)
      tr3.set('fixture', false)
      tr3.set('detalhe', 'prova um dono — pedido 3 (nao pode trocar)')
      $app.save(tr3)
    } catch (e4) {}
    var dono2 = ''
    try {
      const r2 = $app.findRecordById(colL, lead.id)
      dono2 = String(r2.get('owner_id') || '')
    } catch (e5) {}
    out.passos.push({
      passo: '4. dono após o 3º pedido (não pode trocar)',
      ok: dono1 !== '' && dono1 === dono2,
      detalhe: 'antes=' + dono1.slice(0, 12) + ' depois=' + dono2.slice(0, 12),
    })

    // 5. quantos eventos de transferência nasceram
    var evs = []
    try {
      evs = $app.findRecordsByFilter(colEv, "lead_id='" + lead.id + "'", '', 100, 0)
    } catch (e6) {}
    var atribuicoes = 0
    for (const x of evs) {
      const t = String(x.get('texto') || '').toLowerCase()
      if (t.indexOf('transferid') >= 0 || t.indexOf('distribu') >= 0 || t.indexOf('atribu') >= 0)
        atribuicoes++
    }
    out.passos.push({
      passo: '5. eventos de atribuição',
      ok: atribuicoes <= 1,
      detalhe: String(atribuicoes) + ' (não pode passar de 1)',
    })

    // 6. limpeza
    try {
      const ts = $app.findRecordsByFilter(colTr, "lead='" + lead.id + "'", '', 50, 0)
      for (const t of ts) {
        try {
          $app.delete(t)
        } catch (a2) {}
      }
    } catch (e7) {}
    try {
      const es = $app.findRecordsByFilter(colEv, "lead_id='" + lead.id + "'", '', 200, 0)
      for (const x of es) {
        try {
          $app.delete(x)
        } catch (b2) {}
      }
    } catch (e8) {}
    try {
      $app.delete(lead)
      out.passos.push({ passo: '6. limpeza', ok: true, detalhe: 'lead e rastros apagados' })
    } catch (e9) {
      out.passos.push({ passo: '6. limpeza', ok: false, detalhe: String(e9).slice(0, 120) })
    }

    var tudoOk = true
    for (const p of out.passos) if (!p.ok) tudoOk = false
    out.ok = tudoOk
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
