/// <reference path="../pb_data/types.d.ts" />
/**
 * AVISO AUTOMÁTICO DE LEAD NOVO (30/10) — cron `wa_aviso_lead_novo`.
 *
 * Por que existe: o agente da agência para amanhã. O aviso ao vendedor que já
 * existia só dispara na TRANSFERÊNCIA manual. Este cobre o caso de o cliente
 * chegar sozinho: todo lead novo (sem dono) recebe vendedor pelo rodízio, e o
 * vendedor recebe aviso com nome e telefone. Nenhum lead fica sem dono.
 *
 * REGRAS:
 *  - pega leads `fixture=false` com `owner_id` VAZIO e criados nas últimas 24h
 *  - escolhe o vendedor de MENOR carga ativa (mesma lógica do rodízio)
 *  - NUNCA escolhe gestão (escopo '*') nem o dono nem fixture
 *  - grava `owner_id` no lead e um evento na trilha
 *  - registra o aviso em `whatsapp_eventos` (dedupe por lead) para não repetir
 *  - NÃO enfileira mensagem de WhatsApp: o envio pela API está bloqueado
 *    (130497). O aviso aparece na tela; quando a Meta liberar, ligar o envio
 *    com uma linha (ENVIAR_WHATSAPP = true).
 *
 * JSVM: tudo INLINE, nada de helper no topo (lição de hoje).
 */

cronAdd('wa_aviso_lead_novo', '*/5 * * * *', () => {
  // quando a Meta liberar o envio, trocar para true
  const ENVIAR_WHATSAPP = false
  // instrumentação 09/11: sem isto não se sabia se o cron rodava nem onde parava
  console.log('wa_aviso_lead_novo: inicio')

  try {
    // ---------- vendedores elegíveis ----------
    const colU = $app.findCollectionByNameOrId('users')
    const colG = $app.findCollectionByNameOrId('access_grants')
    var usuarios = []
    try {
      usuarios = $app.findRecordsByFilter(colU, '', 'email', 200, 0)
    } catch (e0) {
      return
    }

    const vendedores = []
    for (const u of usuarios) {
      const email = String(u.get('email') || '')
      const nome = String(u.get('name') || '')
      if (email === '') continue
      if (email.toLowerCase().indexOf('fixture') >= 0) continue
      if (nome.toLowerCase().indexOf('fixture') >= 0) continue
      if (email.indexOf('josth') >= 0) continue

      var ehVendedor = false
      var ehGestao = false
      try {
        const gs = $app.findRecordsByFilter(
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
          if (a.indexOf('read_conversas') >= 0 || a.indexOf('read_leads') >= 0) ehVendedor = true
        }
      } catch (eG) {}
      if (!ehVendedor || ehGestao) continue
      // CA-3-110 (09/11): conta de teste NÃO é vendedor válido.
      // Sem isto, as 7 conexões `FIXTURE QA` entravam na lista e a validação
      // de "dono inválido" aceitava lead entregue a elas.
      if (email.indexOf('fixture') >= 0) continue
      if (nome.toLowerCase().indexOf('fixture') >= 0) continue
      vendedores.push({ id: u.id, nome: nome || email, email: email })
    }
    console.log('wa_aviso_lead_novo: vendedores validos = ' + vendedores.length)
    if (vendedores.length === 0) return

    // ---------- carga ativa por vendedor ----------
    const colL = $app.findCollectionByNameOrId('crm_leads')
    var todos = []
    try {
      todos = $app.findRecordsByFilter(colL, 'fixture=false', '', 6000, 0)
    } catch (e1) {
      return
    }
    const carga = {}
    for (const l of todos) {
      const ow = String(l.get('owner_id') || '')
      if (ow === '') continue
      const st = String(l.get('status') || 'entrada_lead')
      if (st === 'venda_realizada' || st === 'finalizado' || st === 'descartado') continue
      carga[ow] = (carga[ow] || 0) + 1
    }

    // ---------- leads sem dono nas últimas 24h ----------
    const agora = new Date().getTime()
    const colEv = $app.findCollectionByNameOrId('whatsapp_eventos')

    // CA-3-110 (09/11): também entra o lead com DONO INVÁLIDO.
    // Dono que não é um dos vendedores com conexão ativa (conta de teste,
    // gestão ou agência) é o mesmo que não ter dono: ninguém atende. Foram 24
    // casos em 09/11 (CA-3-104). Aqui eles voltam para o ponto único.
    const idsValidos = {}
    for (const v of vendedores) idsValidos[String(v.get('id') || '')] = true

    var distribuidos = 0
    for (const l of todos) {
      const ow = String(l.get('owner_id') || '')
      // sem dono OU com dono que não atende
      if (ow !== '' && idsValidos[ow] === true) continue
      const criado = String(l.get('created') || '')
      if (criado === '') continue
      var idade = agora - new Date(criado).getTime()
      // janela de 30 dias: cobre a base que ficou sem dono antes da
      // distribuicao automatica existir (34 leads de 28/10 encontrados)
      if (!(idade >= 0) || idade > 30 * 86400000) {
        console.log('wa_aviso_lead_novo: lead fora da janela de 30d -> ' + l.id)
        continue
      }

      // já avisado? (dedupe por lead)
      const chave = 'aviso_lead_novo|' + l.id
      try {
        const ja = $app.findRecordsByFilter(colEv, "dedupe_key='" + chave + "'", '', 1, 0)
        if (ja && ja.length > 0) continue
      } catch (e2) {}

      // CA-3-43 (05/11) — UM LEAD, UM DONO. Este cron NÃO escolhe mais dono:
      // ele pede a atribuição ao ponto único (`whatsapp_transferencias`), que
      // aplica carteira → menor carga e grava uma vez só. Antes ele escolhia
      // aqui e o robô escolhia no `wa_roteiro_cron`, cada um com sua conta: em
      // 04/11 o mesmo lead apareceu para duas vendedoras.
      try {
        const colTr = $app.findCollectionByNameOrId('whatsapp_transferencias')
        const tr = new Record(colTr)
        tr.set('lead', l.id)
        tr.set('origem_pedido', 'botao')
        tr.set('motivo', 'primeiro_contato')
        tr.set('simulacao', false)
        tr.set('fixture', false)
        tr.set('detalhe', 'distribuicao automatica do lead novo (24h)')
        $app.save(tr)
        distribuidos++
      } catch (e3) {
        continue
      }

      // evento na trilha do lead
      try {
        const colTr = $app.findCollectionByNameOrId('crm_lead_events')
        const ev = new Record(colTr)
        ev.set('lead_id', l.id)
        ev.set('tipo', 'status')
        // o nome do dono é lido DEPOIS, do que o ponto único gravou
        var donoNome = ''
        try {
          const ldRel = $app.findRecordById('crm_leads', l.id)
          donoNome = String(ldRel.get('vendedor_nome') || '')
        } catch (eRel) {}
        ev.set(
          'texto',
          'Distribuído automaticamente pelo rodízio' + (donoNome !== '' ? ' para ' + donoNome : ''),
        )
        ev.set('user_id', '')
        $app.save(ev)
      } catch (e4) {}

      // ---------- CA-3-110 (09/11): SÓ MARCA DEPOIS DE CONFIRMAR O DONO ----------
      // Antes, a `dedupe_key` era gravada logo após criar o pedido. Se a
      // transferência falhasse (como nos 24 órfãos de 09/11), o lead ficava
      // sem dono E sem nova tentativa — o aviso nunca mais seria dado.
      //
      // Agora: relê o lead, confirma o dono gravado e só então marca.
      // Se não houver dono: NÃO marca (tenta de novo na próxima rodada) e,
      // na 3ª falha, joga em "Precisa de ação" com o motivo.
      var donoGravado = ''
      try {
        const ldConf = $app.findRecordById('crm_leads', l.id)
        donoGravado = String(ldConf.get('owner_id') || '')
      } catch (eConf) {}

      if (donoGravado === '') {
        // conta as tentativas desta lead (eventos de falha)
        var tentativasLead = 0
        try {
          const colF = $app.findCollectionByNameOrId('whatsapp_eventos')
          const falhas = $app.findRecordsByFilter(
            colF,
            "evento='aviso_lead_novo_falha' && ref_id='" + l.id + "'",
            '',
            10,
            0,
          )
          tentativasLead = falhas.length
        } catch (eCont) {}

        try {
          const colF2 = $app.findCollectionByNameOrId('whatsapp_eventos')
          const evF = new Record(colF2)
          evF.set('dedupe_key', 'aviso_falha|' + l.id + '|' + String(tentativasLead + 1))
          evF.set('evento', 'aviso_lead_novo_falha')
          evF.set('session_id', '')
          evF.set('ref_id', l.id)
          evF.set('resultado', 'dono_nao_gravado')
          evF.set('codigo_erro', 'tentativa ' + String(tentativasLead + 1))
          evF.set('trace_id', '')
          evF.set('duracao_ms', 0)
          evF.set('recebido_em', new Date().toISOString())
          evF.set('fixture', false)
          $app.save(evF)
        } catch (eF) {}

        // na 3ª falha, manda para "Precisa de ação"
        if (tentativasLead + 1 >= 3) {
          try {
            const colPA = $app.findCollectionByNameOrId('precisa_acao')
            const jaPA = $app.findRecordsByFilter(
              colPA,
              "lead='" + l.id + "' && resolvido=false",
              '',
              1,
              0,
            )
            if (!jaPA || jaPA.length === 0) {
              const pa = new Record(colPA)
              pa.set('lead', l.id)
              pa.set('motivo', 'dono_nao_gravado')
              pa.set('dono_anterior', '')
              pa.set('dono_anterior_nome', '')
              pa.set('resolvido', false)
              pa.set('fixture', false)
              $app.save(pa)
            }
          } catch (ePA) {}
        }
        continue // não grava a dedupe: tenta de novo na próxima rodada
      }

      // dono confirmado: agora sim registra o aviso
      try {
        const evA = new Record(colEv)
        evA.set('dedupe_key', chave)
        evA.set('evento', 'aviso_lead_novo')
        evA.set('session_id', '')
        evA.set('ref_id', l.id)
        evA.set('resultado', ENVIAR_WHATSAPP ? 'enviado_whatsapp' : 'registrado_sem_envio')
        evA.set('codigo_erro', 'dono confirmado: ' + donoGravado.slice(0, 12))
        evA.set('trace_id', '')
        evA.set('duracao_ms', 0)
        evA.set('recebido_em', new Date().toISOString())
        evA.set('fixture', false)
        $app.save(evA)
      } catch (e5) {}
    }

    console.log(
      'wa_aviso_lead_novo: fim, distribuidos = ' + distribuidos + ' de ' + todos.length + ' lidos',
    )
  } catch (eTop) {}
})

// ==================== consulta: quem está sem dono ====================
routerAdd(
  'GET',
  '/backend/v1/crm/sem-dono',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    const colL = $app.findCollectionByNameOrId('crm_leads')
    var todos = []
    try {
      todos = $app.findRecordsByFilter(colL, 'fixture=false && owner_id=""', '', 500, 0)
    } catch (e1) {}

    const itens = []
    for (const l of todos) {
      itens.push({
        id: l.id,
        nome: String(l.get('nome') || ''),
        telefone: String(l.get('telefone') || ''),
        origem: String(l.get('origem') || ''),
        status: String(l.get('status') || ''),
        criado: String(l.get('created') || '').slice(0, 19),
      })
    }
    return e.json(200, { ok: true, total: itens.length, itens: itens })
  },
  $apis.requireAuth(),
)
