/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO (09/11) — por que o dono não é gravado?
 *
 * **SÓ LEITURA + um teste controlado.** O pedido de rodízio diz `concluida`,
 * com vendedor escolhido, mas o lead fica sem dono.
 *
 * Aqui se faz o caminho do pedido, passo a passo, e se tenta o `save` do dono
 * com o MESMO código, capturando o erro real (que hoje é engolido).
 *
 * GET /backend/v1/diag/porque-sem-dono?lead=<id>
 */
routerAdd(
  'GET',
  '/backend/v1/diag/porque-sem-dono',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const leadId = String(e.request.url.query().get('lead') || '')
    const out = { ok: true, passos: [], teste_save: null }

    // ---------- acha um lead sem dono que tem pedido ----------
    var lead = null
    var pedido = null
    try {
      const colL = app.findCollectionByNameOrId('crm_leads')
      if (leadId !== '') {
        lead = app.findRecordById('crm_leads', leadId)
      } else {
        const semDono = app.findRecordsByFilter(colL, 'fixture=false', '', 6000, 0)
        for (const l of semDono) {
          if (String(l.get('owner_id') || '') !== '') continue
          if (String(l.get('status') || '') === 'descartado') continue
          const tr = app.findRecordsByFilter(
            app.findCollectionByNameOrId('whatsapp_transferencias'),
            "lead='" + l.id + "'",
            '',
            1,
            0,
          )
          if (tr && tr.length > 0) {
            lead = l
            pedido = tr[0]
            break
          }
        }
      }
      if (lead && !pedido) {
        const tr = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_transferencias'),
          "lead='" + lead.id + "'",
          '',
          1,
          0,
        )
        if (tr && tr.length > 0) pedido = tr[0]
      }
    } catch (e0) {
      return e.json(200, { ok: false, erro: String(e0).slice(0, 150) })
    }
    if (!lead) return e.json(404, { ok: false, erro: 'nenhum lead sem dono com pedido' })

    out.lead = {
      id: lead.id,
      nome: String(lead.get('nome') || ''),
      status: String(lead.get('status') || ''),
      owner_id: String(lead.get('owner_id') || ''),
      origem: String(lead.get('origem') || ''),
      fixture: String(lead.get('fixture')) === 'true',
    }
    out.passos.push({
      passo: '1. lead encontrado',
      ok: true,
      detalhe: 'status=' + out.lead.status + ' owner=[' + out.lead.owner_id + ']',
    })

    if (!pedido) {
      out.passos.push({ passo: '2. pedido', ok: false, detalhe: 'sem pedido' })
      return e.json(200, out)
    }

    const vendId = String(pedido.get('vendedor_user') || '')
    out.pedido = {
      id: pedido.id,
      estado: String(pedido.get('estado') || ''),
      vendedor_user: vendId,
      vendedor_nome: String(pedido.get('vendedor_nome') || ''),
      regra: String(pedido.get('regra') || ''),
      detalhe: String(pedido.get('detalhe') || ''),
      simular: String(pedido.get('simulacao')) === 'true',
      criado_por: String(pedido.get('criado_por') || ''),
    }
    out.passos.push({
      passo: '2. pedido',
      ok: true,
      detalhe:
        'estado=' +
        out.pedido.estado +
        ' vendedor=[' +
        vendId +
        '] simulacao=' +
        out.pedido.simular,
    })

    // ---------- 3. a condição do bloco 3 é verdadeira? ----------
    const cond1 = String(lead.get('owner_id') || '') === ''
    const cond2 = vendId !== ''
    out.passos.push({
      passo: '3. condição do bloco que grava o dono',
      ok: cond1 && cond2,
      detalhe: 'owner vazio=' + cond1 + ' | vendedor nao vazio=' + cond2,
    })

    // ---------- 4. TESTE: grava o dono com o mesmo código e mostra o erro ----------
    var teste = { tentou: false, ok: false, erro: '', antes: String(lead.get('owner_id') || '') }
    if (vendId !== '') {
      teste.tentou = true
      try {
        lead.set('owner_id', vendId)
        $app.save(lead)
        teste.ok = true
      } catch (eSave) {
        teste.erro = String(eSave).slice(0, 300)
      }
      // lê de novo para ver se persistiu
      try {
        const relido = $app.findRecordById('crm_leads', lead.id)
        teste.depois = String(relido.get('owner_id') || '')
      } catch (eR) {}
    }
    out.teste_save = teste

    // ---------- 5. se gravou, DEVOLVE ao estado original ----------
    if (teste.ok && teste.depois === vendId) {
      try {
        lead.set('owner_id', '')
        $app.save(lead)
        out.passos.push({
          passo: '5. revertido ao estado original (segue sem dono)',
          ok: true,
          detalhe: 'owner voltou para vazio',
        })
      } catch (eRev) {
        out.passos.push({
          passo: '5. REVERTER',
          ok: false,
          detalhe: 'FALHOU: ' + String(eRev).slice(0, 120),
        })
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
