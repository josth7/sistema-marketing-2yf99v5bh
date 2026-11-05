/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0128 — coloca as conversas sem dono no rodízio (05/11).
 *
 * Contexto: 19 conversas da central esperando resposta estão com o lead sem
 * dono. Não aparecem na tela de nenhum vendedor — cliente falando e ninguém
 * vendo. A regra do rodízio já existe no sistema: cada lead vai para o
 * vendedor de MENOR CARGA, contando só leads pendentes e ignorando fixture.
 *
 * O que esta migração NÃO faz:
 *   - não toca em conversa que já tem dono;
 *   - não mexe no estado da conversa (quem decide se o robô responde é o
 *     painel e a janela de tempo);
 *   - não atribui a conta de teste (nomes/telefones de prova de 28/10), que
 *     ficariam poluindo a carteira de um vendedor real.
 *
 * Idempotente: só age em lead com `owner_id` vazio.
 */
migrate(
  (app) => {
    // contas de teste conhecidas da base (não vão para carteira de ninguém)
    const TESTES = [
      'cliente externo real',
      'cliente novo real',
      'teste timestamp',
      'teste atendimento',
      'contato qa',
      'prova suspensao',
      'teste',
    ]

    function ehTeste(nome, telefone) {
      const n = String(nome || '').toLowerCase()
      const t = String(telefone || '')
      for (const p of TESTES) {
        if (n === p || n.indexOf(p) === 0) return true
      }
      // números de prova usados nos testes (…990000xx)
      if (t.indexOf('5541999000') === 0) return true
      return false
    }

    // ---------- vendedores elegíveis (mesma regra do resto do sistema) ----------
    const colU = app.findCollectionByNameOrId('users')
    const colG = app.findCollectionByNameOrId('access_grants')
    const colL = app.findCollectionByNameOrId('crm_leads')
    const colCv = app.findCollectionByNameOrId('whatsapp_conversas')
    const colCx = app.findCollectionByNameOrId('whatsapp_conexoes')

    var central = null
    try {
      const c = app.findRecordsByFilter(colCx, "papel='central' && ativo=true", '', 5, 0)
      if (c && c.length > 0) central = c[0]
    } catch (e0) {}

    // carga atual: leads pendentes por dono
    var todosLeads = []
    try {
      todosLeads = app.findRecordsByFilter(colL, 'fixture=false', '', 8000, 0)
    } catch (e1) {}

    const carga = {}
    for (const l of todosLeads) {
      const ow = String(l.get('owner_id') || '')
      if (ow === '') continue
      const st = String(l.get('status') || 'entrada_lead')
      if (st === 'venda_realizada' || st === 'finalizado' || st === 'descartado') continue
      carga[ow] = (carga[ow] || 0) + 1
    }

    var vendedores = []
    try {
      const us = app.findRecordsByFilter(colU, '', '', 300, 0)
      for (const u of us) {
        const em = String(u.get('email') || '')
        const nm = String(u.get('name') || '')
        if (em === '') continue
        if (em.toLowerCase().indexOf('fixture') >= 0) continue
        if (nm.toLowerCase().indexOf('fixture') >= 0) continue
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
            var a = []
            var sc = []
            try {
              const rawA = g.get('actions')
              a =
                Array.isArray(rawA) && rawA.length > 0 && typeof rawA[0] === 'number'
                  ? JSON.parse(String.fromCharCode.apply(null, rawA))
                  : typeof rawA === 'string'
                    ? JSON.parse(rawA)
                    : rawA || []
            } catch (eA) {}
            try {
              const rawS = g.get('scope_accounts')
              sc =
                Array.isArray(rawS) && rawS.length > 0 && typeof rawS[0] === 'number'
                  ? JSON.parse(String.fromCharCode.apply(null, rawS))
                  : typeof rawS === 'string'
                    ? JSON.parse(rawS)
                    : rawS || []
            } catch (eS) {}
            if (Array.isArray(sc) && sc.indexOf('*') >= 0) ehGestao = true
            if (
              Array.isArray(a) &&
              (a.indexOf('read_leads') >= 0 || a.indexOf('read_conversas') >= 0)
            )
              ehVend = true
          }
        } catch (eG) {}
        if (!ehVend || ehGestao) continue
        vendedores.push({ id: u.id, nome: nm || em, carga: carga[u.id] || 0 })
      }
    } catch (e2) {}

    if (vendedores.length === 0) {
      console.log('0128: nenhum vendedor elegivel — nada a fazer')
      return
    }

    // ---------- conversas da central em triagem ----------
    var conversas = []
    if (central) {
      try {
        conversas = app.findRecordsByFilter(
          colCv,
          "conexao='" + central.id + "' && estado='triagem'",
          '',
          1000,
          0,
        )
      } catch (e3) {}
    }

    var atribuidos = 0
    var puladosTeste = 0
    var semLead = 0

    for (const cv of conversas) {
      const leadId = String(cv.get('lead') || '')
      if (leadId === '') {
        semLead++
        continue
      }
      var lead = null
      try {
        lead = app.findRecordById(colL, leadId)
      } catch (e4) {
        semLead++
        continue
      }
      // só lead sem dono
      if (String(lead.get('owner_id') || '') !== '') continue
      // não dar conversa de teste a vendedor real
      if (ehTeste(lead.get('nome'), lead.get('telefone'))) {
        puladosTeste++
        continue
      }

      // menor carga
      var escolhido = null
      for (const v of vendedores) {
        if (!escolhido || v.carga < escolhido.carga) escolhido = v
      }
      if (!escolhido) break

      try {
        lead.set('owner_id', escolhido.id)
        lead.set('vendedor_nome', escolhido.nome)
        app.save(lead)
        escolhido.carga++
        atribuidos++

        // trilha
        try {
          const colEv = app.findCollectionByNameOrId('crm_lead_events')
          const ev = new Record(colEv)
          ev.set('lead_id', lead.id)
          ev.set('tipo', 'status')
          ev.set(
            'texto',
            'Atribuído ao rodízio em 05/11 (lead estava sem dono; havia conversa esperando resposta)',
          )
          ev.set('fixture', false)
          app.save(ev)
        } catch (eEv) {}
      } catch (e5) {
        console.log('0128: falhou lead ' + leadId + ' -> ' + String(e5).slice(0, 120))
      }
    }

    console.log(
      '0128: atribuidos=' +
        atribuidos +
        ' | pulados(conta de teste)=' +
        puladosTeste +
        ' | sem lead=' +
        semLead +
        ' | vendedores=' +
        vendedores.length,
    )
  },
  (app) => {
    console.log('0128 revertida (atribuicoes permanecem; reverter exigiria lista)')
  },
)
