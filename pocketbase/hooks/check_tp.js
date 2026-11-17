/// <reference path="../pb_data/types.d.ts" />
/**
 * TRANSFERÊNCIAS PENDENTES — por que não foram processadas (17/11).
 *
 * Achei 2 pedidos em `pendente` de hoje. O hook `whatsapp_transferencias` roda
 * em `onRecordAfterCreateSuccess`; se o registro nasceu por outro caminho (ou o
 * hook não pegou), o pedido fica parado e o lead não recebe dono.
 *
 * GET /backend/v1/check/transf-pendentes?processar=1
 *   sem `processar` é só leitura; com `processar=1` cria o dono pelo MESMO
 *   critério do sistema e marca o pedido como concluída.
 */
routerAdd(
  'GET',
  '/backend/v1/check/transf-pendentes',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const processar = String(e.request.url.query().get('processar') || '') === '1'
    const out = { ok: true, processar: processar, pendentes: [], feitos: [], erros: [] }

    var trs = []
    try {
      trs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_transferencias'),
        "estado='pendente'",
        '-created',
        50,
        0,
      )
    } catch (e0) {}

    // vendedores ativos: ordem fixa do rodízio (decisão do dono, 09/11)
    const ORDEM = [
      'adriana@haisan.com.br',
      'douglasrenato@haisan.com.br',
      'elisangela@haisan.com.br',
      'fabio@haisan.com.br',
    ]
    const ativosPorEmail = {}
    try {
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor' && ativo=true && fixture=false",
        '',
        30,
        0,
      )) {
        const uid = String(c.get('vendedor_user') || '')
        if (uid === '') continue
        try {
          const u = app.findRecordById('users', uid)
          const em = String(u.get('email') || '').toLowerCase()
          if (em !== '')
            ativosPorEmail[em] = { id: uid, nome: String(c.get('nome_exibicao') || '') }
        } catch (eU) {}
      }
    } catch (e1) {}

    for (const t of trs) {
      const leadId = String(t.get('lead') || '')
      const info = {
        quando: String(t.get('created') || '').slice(0, 16),
        motivo: String(t.get('motivo') || ''),
        lead: leadId.slice(0, 10),
        vendedor_nome: String(t.get('vendedor_nome') || ''),
        detalhe: String(t.get('detalhe') || '').slice(0, 60),
      }

      var lead = null
      try {
        lead = app.findRecordById('crm_leads', leadId)
      } catch (eL) {}

      if (!lead) {
        info.problema = 'lead nao existe'
        out.pendentes.push(info)
        continue
      }
      const dono = String(lead.get('owner_id') || '')
      info.nome = String(lead.get('nome') || '').slice(0, 22)
      info.dono_atual = dono === '' ? '(sem dono)' : dono.slice(0, 10)
      out.pendentes.push(info)

      if (!processar) continue
      if (dono !== '') {
        // já tem dono: só fecha o pedido
        t.set('estado', 'concluida')
        t.set('detalhe', 'lead ja tinha dono ao reprocessar (17/11)')
        try {
          $app.save(t)
          out.feitos.push({ lead: leadId.slice(0, 10), acao: 'fechado, ja tinha dono' })
        } catch (e2) {}
        continue
      }

      // sem dono: entrega ao próximo da ordem fixa (como o rodízio)
      var escolhido = null
      for (const em of ORDEM) {
        if (ativosPorEmail[em] !== undefined) {
          escolhido = ativosPorEmail[em]
          break
        }
      }
      if (!escolhido) {
        out.erros.push({ lead: leadId.slice(0, 10), erro: 'nenhum vendedor ativo' })
        continue
      }
      try {
        lead.set('owner_id', escolhido.id)
        $app.save(lead)
        const conf = $app.findRecordById('crm_leads', leadId)
        if (String(conf.get('owner_id') || '') === escolhido.id) {
          t.set('estado', 'concluida')
          t.set('vendedor_user', escolhido.id)
          t.set('vendedor_nome', escolhido.nome)
          t.set('detalhe', 'reprocessado 17/11: pendente sem dono, entregue na ordem fixa')
          $app.save(t)
          out.feitos.push({ lead: leadId.slice(0, 10), para: escolhido.nome })
        } else {
          out.erros.push({ lead: leadId.slice(0, 10), erro: 'save nao persistiu' })
        }
      } catch (e3) {
        out.erros.push({ lead: leadId.slice(0, 10), erro: String(e3).slice(0, 100) })
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
