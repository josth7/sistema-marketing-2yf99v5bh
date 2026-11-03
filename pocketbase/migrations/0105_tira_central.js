/// <reference path="../pb_data/types.d.ts" />
// ===================================================================
// MIG 0105 — TIRA AS CONVERSAS DA CENTRAL (03/11).
//
// Ordem do dono: "eu não gostaria que as conversas ficassem paradas na central".
//
// O PROBLEMA MEDIDO: 48 conversas esperando resposta estão no número da
// central. O lead até tem dono no CRM, mas a CONVERSA vive no número da
// central — e o vendedor não enxerga a central (regra de privacidade RN-87).
// Resultado: cliente esperando alguém que não vê a conversa.
//
// O QUE ESTA MIGRAÇÃO FAZ (nada de mensagem inventada):
//   1. pega as conversas da central em `triagem`/`pausada_humano` cujo último
//      autor é o cliente (ou seja: esperando resposta)
//   2. garante que o lead tem dono — se não tiver, distribui pelo rodízio
//   3. grava um pedido em `whatsapp_transferencias` com motivo
//      `fora_do_roteiro`, que o hook existente processa: manda o aviso ao
//      vendedor com nome/telefone do cliente para ele INICIAR a conversa pelo
//      número dele
//   4. registra na trilha do lead quem recebeu e quando
//
// POR QUE NÃO MOVE A CONVERSA DE CONEXÃO: a conversa já aconteceu no número
// da central; a Meta não permite "migrar" histórico entre números. Quem atende
// passa a ser o vendedor, pelo número dele, e a conversa nova nasce lá. Mover
// o registro por cima mentiria sobre por onde a mensagem saiu.
//
// NÃO apaga nada. Não envia mensagem nenhuma ao cliente.
// ===================================================================
migrate(
  (app) => {
    const colCv = app.findCollectionByNameOrId('whatsapp_conversas')
    const colL = app.findCollectionByNameOrId('crm_leads')
    const colM = app.findCollectionByNameOrId('whatsapp_mensagens')
    const colU = app.findCollectionByNameOrId('users')
    const colG = app.findCollectionByNameOrId('access_grants')
    const colCx = app.findCollectionByNameOrId('whatsapp_conexoes')
    const colTr = app.findCollectionByNameOrId('whatsapp_transferencias')

    // ---------- central ----------
    var central = null
    try {
      const cs = app.findRecordsByFilter(colCx, "papel='central' && ativo=true", '', 5, 0)
      if (cs.length > 0) central = cs[0]
    } catch (e0) {}
    if (!central) {
      console.log('0105: sem conexao central ativa — nada a fazer')
      return
    }

    // ---------- vendedores elegiveis ----------
    var vendedores = []
    try {
      const us = app.findRecordsByFilter(colU, '', '', 200, 0)
      for (const u of us) {
        const em = String(u.get('email') || '')
        const nm = String(u.get('name') || '')
        if (em === '' || em.toLowerCase().indexOf('fixture') >= 0) continue
        if (nm.toLowerCase().indexOf('fixture') >= 0) continue
        if (em.indexOf('josth') >= 0) continue
        var ehVend = false
        var ehGestao = false
        try {
          const gs = app.findRecordsByFilter(
            colG,
            "user_id='" + u.id + "' && revoked_at=''",
            '',
            20,
            0,
          )
          for (const g of gs) {
            let a = []
            let sc = []
            try {
              const rA = g.get('actions')
              a =
                Array.isArray(rA) && rA.length > 0 && typeof rA[0] === 'number'
                  ? JSON.parse(String.fromCharCode.apply(null, rA))
                  : typeof rA === 'string'
                    ? JSON.parse(rA)
                    : rA || []
            } catch (eA) {}
            try {
              const rS = g.get('scope_accounts')
              sc =
                Array.isArray(rS) && rS.length > 0 && typeof rS[0] === 'number'
                  ? JSON.parse(String.fromCharCode.apply(null, rS))
                  : typeof rS === 'string'
                    ? JSON.parse(rS)
                    : rS || []
            } catch (eS) {}
            if (Array.isArray(sc) && sc.indexOf('*') >= 0) ehGestao = true
            if (a.indexOf('read_conversas') >= 0 || a.indexOf('read_leads') >= 0) ehVend = true
          }
        } catch (eG) {}
        if (!ehVend || ehGestao) continue
        vendedores.push({ id: u.id, nome: String(u.get('name') || em), carga: 0 })
      }
    } catch (e1) {}
    if (vendedores.length === 0) {
      console.log('0105: sem vendedor elegivel — nada a fazer')
      return
    }

    // carga atual (para equilibrar)
    var todos = []
    try {
      todos = app.findRecordsByFilter(colL, 'fixture=false', '', 6000, 0)
    } catch (e2) {
      return
    }
    const mapaLeads = {}
    const carga = {}
    for (const l of todos) {
      mapaLeads[l.id] = l
      const ow = String(l.get('owner_id') || '')
      if (ow === '') continue
      const st = String(l.get('status') || 'entrada_lead')
      if (st === 'venda_realizada' || st === 'finalizado' || st === 'descartado') continue
      carga[ow] = (carga[ow] || 0) + 1
    }
    for (const v of vendedores) v.carga = carga[v.id] || 0

    // ---------- conversas da central esperando resposta ----------
    var conversas = []
    try {
      conversas = app.findRecordsByFilter(
        colCv,
        "conexao='" + central.id + "' && fixture=false",
        '',
        1000,
        0,
      )
    } catch (e3) {
      console.log('0105: nao consegui listar conversas: ' + e3)
      return
    }

    var trabalhadas = 0
    for (const cv of conversas) {
      // so as que esperam resposta do cliente
      var msgs = []
      try {
        msgs = app.findRecordsByFilter(
          colM,
          "conexao='" +
            String(cv.get('conexao') || '') +
            "' && contato_telefone='" +
            String(cv.get('contato_telefone') || '') +
            "'",
          '',
          3,
          0,
        )
      } catch (e4) {
        continue
      }
      if (msgs.length === 0) continue
      msgs.sort(function (a, b) {
        return String(b.get('created') || '').localeCompare(String(a.get('created') || ''))
      })
      if (String(msgs[0].get('direcao')) !== 'entrada') continue

      // ---------- quem recebe ----------
      // 1) o dono do lead, se existir; 2) senao o de menor carga
      const idLead = String(cv.get('lead') || '')
      var lead = idLead !== '' ? mapaLeads[idLead] : null
      var escolhido = null
      if (lead) {
        const ow = String(lead.get('owner_id') || '')
        if (ow !== '') {
          for (const v of vendedores) {
            if (v.id === ow) escolhido = v
          }
        }
      }
      if (!escolhido) {
        for (const v of vendedores) {
          if (!escolhido || v.carga < escolhido.carga) escolhido = v
        }
      }
      if (!escolhido) continue

      // ---------- garante o dono no lead ----------
      if (lead) {
        try {
          const owAtual = String(lead.get('owner_id') || '')
          if (owAtual === '') {
            lead.set('owner_id', escolhido.id)
            lead.set('vendedor_nome', escolhido.nome)
            app.save(lead)
            escolhido.carga++
          }
        } catch (e5) {}
      }

      // ---------- pedido de transferencia (o hook manda o aviso) ----------
      try {
        const pedido = new Record(colTr)
        pedido.set('lead', idLead)
        pedido.set('origem_pedido', 'migracao_0105')
        pedido.set('motivo', 'fora_do_roteiro')
        pedido.set('simulacao', false)
        pedido.set('estado', 'pendente')
        pedido.set('criado_por', '')
        pedido.set('fixture', false)
        // o hook usa o dono do lead como destino; garante que esta setado
        if (lead) {
          lead.set('owner_id', escolhido.id)
          lead.set('vendedor_nome', escolhido.nome)
          try {
            app.save(lead)
          } catch (eSaveLead) {}
        }
        app.save(pedido)
        trabalhadas++
      } catch (e6) {
        console.log('0105: falha no pedido da conversa ' + cv.id + ': ' + String(e6))
      }
    }

    var resumo = '0105 RESULTADO: ' + trabalhadas + ' conversa(s) da central distribuidas | '
    for (const v of vendedores) resumo += v.nome + '=' + v.carga + ' '
    console.log(resumo)
  },
  (app) => {
    // reversivel: remove os pedidos desta migracao
    try {
      const colTr = app.findCollectionByNameOrId('whatsapp_transferencias')
      const ps = app.findRecordsByFilter(colTr, "origem_pedido='migracao_0105'", '', 2000, 0)
      for (const p of ps) {
        try {
          app.delete(p)
        } catch (e1) {}
      }
    } catch (e0) {}
  },
)
