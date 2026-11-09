/// <reference path="../pb_data/types.d.ts" />
/**
 * Transferência de lead para vendedor — RN-67 + RN-68 + RN-69 (CA-3-16).
 *
 * O pedido entra em `whatsapp_transferencias` e este hook executa, para
 * produção e simulação usarem o MESMO código.
 *
 *  - lead com responsável → mantém (carteira)
 *  - sem responsável → mesmo critério de /crm/rodizio (menos leads em aberto)
 *  - grava responsável, `novo` → `em_contato`, evento na trilha
 *  - enfileira aviso ao vendedor e aviso ao cliente e TENTA ENVIAR AGORA (RN-69)
 *  - janela de 24 h: dentro → texto; fora → modelo; sem modelo →
 *    `fora_da_janela_sem_modelo`
 *  - segunda transferência para o mesmo vendedor não reenvia (dedupe_key)
 *  - manutenção → item na caixa, sem rodízio
 *  - vendedor sem conexão → atribui, não envia, `sem_numero`
 *  - simulação → só calcula, não grava nada
 *  - transferência fixture usa SÓ conexões e usuários fixture (isolamento)
 *
 * JSVM: lógica INLINE; $secrets.get; corpo do $http.send vem em char-codes.
 */

onRecordAfterCreateSuccess((e) => {
  // Guarda de coleção: sem isto o hook roda em TODA criação do sistema.
  try {
    if (String(e.record.collection().name) !== 'whatsapp_transferencias') {
      e.next()
      return
    }
  } catch (eCol) {
    e.next()
    return
  }

  try {
    const tr = e.record
    const simular = String(tr.get('simulacao')) === 'true'
    const leadId = String(tr.get('lead') || '')
    const motivo = String(tr.get('motivo') || 'primeiro_contato')
    const ehFixture = String(tr.get('fixture')) === 'true'

    let lead = null
    try {
      lead = $app.findRecordById('crm_leads', leadId)
    } catch (eL) {
      tr.set('estado', 'erro')
      tr.set('detalhe', 'lead_nao_encontrado')
      try {
        $app.save(tr)
      } catch (eSvT) {
        console.log('transferencias: save falhou -> ' + String(eSvT).slice(0, 160))
      }
      e.next()
      return
    }

    // ---------- 1. qual vendedor? ----------
    var vendedorId = String(lead.get('owner_id') || '')
    var regra = 'carteira'
    var vendedorNome = ''

    if (motivo === 'manutencao') {
      regra = 'manutencao'
      vendedorId = ''
    } else if (vendedorId !== '') {
      regra = 'carteira'
    } else {
      regra = 'rodizio'
      const colL = $app.findCollectionByNameOrId('crm_leads')
      const todos = $app.findRecordsByFilter(
        colL,
        'fixture=' + (ehFixture ? 'true' : 'false'),
        '',
        5000,
        0,
      )
      const carga = {}
      for (const l of todos) {
        const ow = String(l.get('owner_id') || '')
        if (ow === '') continue
        // Lead encerrado não pesa na carga (06/11). Desde o funil de 10 etapas
        // (0097, 30/10) os encerrados são venda_realizada, producao, finalizado
        // e descartado; antes só os nomes antigos eram excluídos e venda e
        // descarte contavam como "em aberto" — quem tinha carteira antiga com
        // muita venda (Fábio, Adriana) nunca ficava com a menor carga.
        // Os nomes antigos ficam por segurança.
        const st = String(l.get('status') || 'entrada_lead')
        if (
          st === 'venda_realizada' ||
          st === 'producao' ||
          st === 'finalizado' ||
          st === 'descartado' ||
          st === 'fechado' ||
          st === 'perdido'
        )
          continue
        carga[ow] = (carga[ow] || 0) + 1
      }
      // BUG CORRIGIDO 05/11: o rodízio só excluía o `josth`. Como a gestão tem
      // carga 0 (não recebe lead), ela era sempre a "menor carga" e o lead real
      // caía na Anezia — que não tem conexão de WhatsApp e o pedido morria em
      // `vendedor_sem_conexao`. Agora só entra quem é VENDEDOR de verdade:
      // tem grant de ler leads/conversas e NÃO tem escopo '*' (gestão).
      const colU = $app.findCollectionByNameOrId('users')
      const colGr = $app.findCollectionByNameOrId('access_grants')
      const colCxCandidato = $app.findCollectionByNameOrId('whatsapp_conexoes')
      const usuarios = $app.findRecordsByFilter(colU, '', '', 200, 0)
      // ORDEM FIXA (decisão do dono, 09/11): sempre
      // Adriana → Douglas → Elisângela → Fábio, em ciclo.
      // Não é mais "menor carga": o dono quer rodízio previsível e igual.
      const ORDEM_FIXA = [
        'adriana@haisan.com.br',
        'douglasrenato@haisan.com.br',
        'elisangela@haisan.com.br',
        'fabio@haisan.com.br',
      ]
      var elegiveis = []
      for (const u of usuarios) {
        const email = String(u.get('email') || '').toLowerCase()
        const nomeU = String(u.get('name') || '').toLowerCase()
        const ehUserFixture = email.indexOf('fixture') >= 0 || nomeU.indexOf('fixture') >= 0
        // isolamento: transferência de teste escala gente de teste, e
        // transferência real NUNCA manda lead para usuário de QA
        if (ehFixture !== ehUserFixture) continue
        if (email.indexOf('josth') >= 0) continue // dono não recebe rodízio

        var ehVendedor = false
        var ehGestao = false
        try {
          const gs = $app.findRecordsByFilter(
            colGr,
            "user_id='" + u.id + "' && revoked_at=''",
            '',
            20,
            0,
          )
          for (const g of gs) {
            var atos = []
            var escopo = []
            try {
              const rawA = g.get('actions')
              atos =
                Array.isArray(rawA) && rawA.length > 0 && typeof rawA[0] === 'number'
                  ? JSON.parse(String.fromCharCode.apply(null, rawA))
                  : typeof rawA === 'string'
                    ? JSON.parse(rawA)
                    : rawA || []
            } catch (eA) {}
            try {
              const rawE = g.get('scope_accounts')
              escopo =
                Array.isArray(rawE) && rawE.length > 0 && typeof rawE[0] === 'number'
                  ? JSON.parse(String.fromCharCode.apply(null, rawE))
                  : typeof rawE === 'string'
                    ? JSON.parse(rawE)
                    : rawE || []
            } catch (eE) {}
            if (Array.isArray(escopo) && escopo.indexOf('*') >= 0) ehGestao = true
            if (
              Array.isArray(atos) &&
              (atos.indexOf('read_leads') >= 0 || atos.indexOf('read_conversas') >= 0)
            )
              ehVendedor = true
          }
        } catch (eG) {}
        // gestão fica fora do rodízio: não tem número de vendedor para atender
        if (!ehVendedor || ehGestao) continue

        // TRAVA (09/11): só entra quem é VENDEDOR DE VERDADE — tem conexão
        // ativa com papel `vendedor` apontando para ele.
        //
        // Antes bastava ter grant de `read_leads`. Isso deixava entrar:
        //   - `Marketing Haisan` (não tem escopo '*', mas não atende cliente);
        //   - `rodrigo@adapta.org` (agência, recebeu 1 lead real);
        //   - contas de teste (`Marketing A/B`, `Revisor Fixture`, `FIXTURE`).
        // Foram 24 de 109 pedidos para contas erradas. Agora só os 4 reais.
        const cxDoVendedor = $app.findRecordsByFilter(
          colCxCandidato,
          "vendedor_user='" + u.id + "' && papel='vendedor' && ativo=true",
          '',
          1,
          0,
        )
        if (!cxDoVendedor || cxDoVendedor.length === 0) continue

        elegiveis.push({ id: u.id, email: email })
      }

      // ---------- escolhe pela ORDEM FIXA, em ciclo ----------
      // Acha quem foi o ÚLTIMO a receber e entrega ao PRÓXIMO da lista.
      // Se ninguém recebeu ainda, começa pela Adriana.
      var ordem = []
      for (const em of ORDEM_FIXA) {
        for (const el of elegiveis) {
          if (el.email === em) ordem.push(el.id)
        }
      }
      // se algum vendedor real não estiver na lista fixa, entra no fim
      for (const el of elegiveis) {
        if (ordem.indexOf(el.id) < 0) ordem.push(el.id)
      }

      if (ordem.length > 0) {
        // quem recebeu por último (pedido de rodízio mais recente)
        var ultimoId = ''
        try {
          const anteriores = $app.findRecordsByFilter(
            $app.findCollectionByNameOrId('whatsapp_transferencias'),
            "regra='rodizio' && estado='concluida'",
            '',
            400,
            0,
          )
          var maiorData = ''
          for (const t of anteriores) {
            const v = String(t.get('vendedor_user') || '')
            const q = String(t.get('created') || '')
            if (v === '' || q === '') continue
            if (q > maiorData) {
              maiorData = q
              ultimoId = v
            }
          }
        } catch (eUlt) {}

        var proximo = ordem[0]
        if (ultimoId !== '') {
          const pos = ordem.indexOf(ultimoId)
          if (pos >= 0) proximo = ordem[(pos + 1) % ordem.length]
        }
        vendedorId = proximo
      }
    }

    if (vendedorId !== '') {
      try {
        const u = $app.findRecordById('users', vendedorId)
        vendedorNome = String(u.get('name') || u.get('email') || '')
      } catch (eU) {}
    }

    if (simular) {
      tr.set('vendedor_user', vendedorId)
      tr.set('vendedor_nome', vendedorNome)
      tr.set('regra', regra)
      tr.set('estado', 'concluida')
      tr.set('detalhe', 'simulacao')
      $app.save(tr)
      e.next()
      return
    }

    // ---------- 2. manutenção ----------
    if (regra === 'manutencao') {
      try {
        const colCaixa = $app.findCollectionByNameOrId('inbox_items')
        const item = new Record(colCaixa)
        item.set('tipo', 'lembrete')
        item.set('scope', 'notificar_manutencao')
        item.set('status', 'pending')
        item.set('dedupe_key', 'manutencao_' + leadId + '_' + String(Date.now()))
        item.set('attempts', 0)
        // user_id é relation: sem valor válido o save falha
        var destinoCx = String(lead.get('owner_id') || '')
        if (destinoCx === '') destinoCx = String(tr.get('criado_por') || '')
        if (destinoCx !== '') item.set('user_id', destinoCx)
        $app.save(item)
        tr.set('estado', 'concluida')
        tr.set('detalhe', 'item_na_caixa')
      } catch (eCx) {
        tr.set('estado', 'erro')
        tr.set('detalhe', 'caixa_indisponivel ' + String(eCx).slice(0, 100))
      }
      $app.save(tr)
      e.next()
      return
    }

    // ---------- 3. grava responsável e move status ----------
    if (String(lead.get('owner_id') || '') === '' && vendedorId !== '') {
      lead.set('owner_id', vendedorId)
      // O status 'novo' não existe mais desde 30/10 (funil de 10 etapas usa
      // 'entrada_lead'); mantido só como fallback para base antiga.
      if (String(lead.get('status') || '') === 'novo') lead.set('status', 'em_contato')
      // GRAVA O DONO E CONFIRMA (correção 09/11).
      // Antes: `$app.save(lead)` sem try/catch. Se o save falhasse, o fluxo
      // seguia, marcava o pedido como `concluida` e o lead ficava SEM DONO —
      // foi assim que 26 leads ficaram órfãos entre 06 e 09/11. Agora o erro
      // fica visível e o pedido registra o motivo.
      var gravouDono = false
      var erroDono = ''
      try {
        $app.save(lead)
        // confirma relendo: o save pode passar e não persistir
        const conferido = $app.findRecordById('crm_leads', leadId)
        gravouDono = String(conferido.get('owner_id') || '') === vendedorId
        if (!gravouDono) erroDono = 'save passou mas owner_id nao persistiu'
      } catch (eDono) {
        erroDono = String(eDono).slice(0, 200)
        console.log('transferencias: NAO consegui gravar o dono -> ' + erroDono)
      }
      if (!gravouDono) {
        // não marca concluída: o pedido tem de mostrar que falhou
        try {
          tr.set('vendedor_user', vendedorId)
          tr.set('vendedor_nome', vendedorNome)
          tr.set('regra', regra)
          tr.set('estado', 'erro')
          tr.set('detalhe', 'dono_nao_gravado: ' + erroDono)
          $app.save(tr)
        } catch (eT2) {}
        e.next()
        return
      }
      try {
        const colEv = $app.findCollectionByNameOrId('crm_lead_events')
        const ev = new Record(colEv)
        ev.set('lead_id', leadId)
        ev.set('tipo', 'status')
        ev.set('texto', 'atribuído pelo rodízio: ' + vendedorNome)
        ev.set('user_id', String(tr.get('criado_por') || ''))
        ev.set('fixture', ehFixture)
        $app.save(ev)
      } catch (eEv) {}
    }

    // ---------- 4. conexões (isoladas por fixture) ----------
    const colCx = $app.findCollectionByNameOrId('whatsapp_conexoes')
    var central = null
    var conexaoVendedor = null
    try {
      const todas = $app.findRecordsByFilter(colCx, 'ativo=true', '', 50, 0)
      for (const c of todas) {
        const ehCxFixture = String(c.get('fixture')) === 'true'
        if (ehCxFixture !== ehFixture) continue
        const papel = String(c.get('papel') || '')
        if (papel === 'central' && !central) central = c
        if (papel === 'vendedor' && String(c.get('vendedor_user') || '') === vendedorId) {
          conexaoVendedor = c
        }
      }
    } catch (eCx2) {}

    if (!conexaoVendedor) {
      tr.set('vendedor_user', vendedorId)
      tr.set('vendedor_nome', vendedorNome)
      tr.set('regra', regra)
      tr.set('estado', 'sem_numero')
      tr.set('detalhe', 'vendedor_sem_conexao')
      $app.save(tr)
      e.next()
      return
    }

    // ---------- 5. janela de 24 h ----------
    const telefoneCliente = String(lead.get('telefone') || '')
    const colM = $app.findCollectionByNameOrId('whatsapp_mensagens')
    const colConv = $app.findCollectionByNameOrId('whatsapp_conversas')

    function janelaAberta(conexao, telefone) {
      // Acha o contato pelas conversas do lead naquela conexão (o telefone do
      // lead pode estar formatado; o contato da conversa é canônico).
      const contatos = []
      if (telefone !== '') contatos.push(telefone)
      try {
        const cs = $app.findRecordsByFilter(colConv, "lead='" + leadId + "'", '', 20, 0)
        for (const c of cs) {
          if (String(c.get('conexao')) !== String(conexao.id)) continue
          const t = String(c.get('contato_telefone') || '')
          if (t !== '' && contatos.indexOf(t) < 0) contatos.push(t)
        }
      } catch (eCs) {}
      var ultima = ''
      for (const t of contatos) {
        try {
          const msgs = $app.findRecordsByFilter(
            colM,
            "conexao='" + conexao.id + "' && contato_telefone='" + t + "'",
            '',
            200,
            0,
          )
          for (const m of msgs) {
            if (String(m.get('direcao')) !== 'entrada') continue
            const q = String(m.get('enviada_em') || '')
            if (q > ultima) ultima = q
          }
        } catch (eM) {}
      }
      if (ultima === '') return false
      const quando = new Date(ultima).getTime()
      if (isNaN(quando)) return false
      return Date.now() - quando < 24 * 60 * 60 * 1000
    }

    // ---------- 6. enfileira + tenta enviar agora ----------
    const colEnv = $app.findCollectionByNameOrId('whatsapp_envios')
    const envios = []
    const numeroVendedor = String(conexaoVendedor.get('numero') || '')

    function processar(env) {
      const destino = String(env.get('destino_telefone') || '')
      if (destino.replace(/\D/g, '').length < 10) {
        env.set('estado', 'sem_numero')
        env.set('ultimo_erro', 'destino_invalido')
        try {
          $app.save(env)
        } catch (eSvT) {
          console.log('transferencias: save falhou -> ' + String(eSvT).slice(0, 160))
        }
        return 'sem_numero'
      }
      const secao = String(
        central ? central.get('nome_segredo_chave') || 'DAPI_API_KEY' : 'DAPI_API_KEY',
      )
      var url = ''
      var auth = ''
      if (ehFixture) {
        // Envio FIXTURE não passa por rede nem por segredo: o envio carrega o
        // status que a D-API devolveria (fixture_status) e a classificação é
        // aplicada aqui, determinística. Depender de URL/segredo fazia o teste
        // cair em erro_definitivo sem provar nada.
        const statusSimulado = Number(env.get('fixture_status') || 200)
        const tentFit = Number(env.get('tentativas') || 0) + 1
        env.set('tentativas', tentFit)
        if (statusSimulado >= 200 && statusSimulado < 300) {
          env.set('estado', 'enviado')
          env.set('ultimo_erro', '')
          env.set('wa_message_id', 'fixture-' + String(Date.now()))
          env.set('enviado_em', new Date().toISOString())
          try {
            $app.save(env)
          } catch (eSvT) {
            console.log('transferencias: save falhou -> ' + String(eSvT).slice(0, 160))
          }
          return 'enviado'
        }
        if (statusSimulado >= 400 && statusSimulado < 500 && statusSimulado !== 429) {
          env.set('estado', 'erro_definitivo')
          env.set('ultimo_erro', 'dapi_http_4xx')
          try {
            $app.save(env)
          } catch (eSvT) {
            console.log('transferencias: save falhou -> ' + String(eSvT).slice(0, 160))
          }
          return 'erro_definitivo'
        }
        env.set('ultimo_erro', statusSimulado === 429 ? 'dapi_http_429' : 'dapi_http_5xx')
        env.set('estado', tentFit >= 3 ? 'erro_definitivo' : 'erro')
        try {
          $app.save(env)
        } catch (eSvT) {
          console.log('transferencias: save falhou -> ' + String(eSvT).slice(0, 160))
        }
        return String(env.get('estado'))
      }
      {
        var chave = ''
        try {
          chave = String($secrets.get(secao) || '')
        } catch (eSec) {}
        if (chave === '') {
          env.set('ultimo_erro', 'chave_nao_configurada')
          try {
            $app.save(env)
          } catch (eSvT) {
            console.log('transferencias: save falhou -> ' + String(eSvT).slice(0, 160))
          }
          return 'pendente'
        }
        url = 'https://api.deliverify.io/api/v1/messages/send/text'
        auth = chave
      }
      const tent = Number(env.get('tentativas') || 0) + 1
      env.set('tentativas', tent)
      var st = 0
      var corpo = ''
      try {
        const resp = $http.send({
          url: url,
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: auth,
            'X-Fixture-Secret': ehFixture ? auth : '',
          },
          body: JSON.stringify({
            sessionId: String((central || conexaoVendedor).get('session_id') || ''),
            to: destino,
            text: String(env.get('texto') || ''),
          }),
          timeout: 10,
        })
        st = Number(resp.statusCode || 0)
        if (Array.isArray(resp.body)) corpo = String.fromCharCode.apply(null, resp.body)
        else if (typeof resp.body === 'string') corpo = resp.body
      } catch (eH) {
        env.set('estado', tent >= 3 ? 'erro_definitivo' : 'erro')
        env.set('ultimo_erro', 'dapi_transporte')
        $app.save(env)
        return String(env.get('estado'))
      }
      if (st >= 200 && st < 300) {
        var idEnviado = ''
        try {
          const j = JSON.parse(corpo)
          idEnviado = String(j.id || (j.data ? j.data.id : '') || '')
        } catch (eP) {}
        env.set('estado', 'enviado')
        env.set('ultimo_erro', '')
        env.set('wa_message_id', idEnviado)
        env.set('enviado_em', new Date().toISOString())
        $app.save(env)
        return 'enviado'
      }
      if (st >= 400 && st < 500 && st !== 429) {
        env.set('estado', 'erro_definitivo')
        env.set('ultimo_erro', 'dapi_http_4xx')
        $app.save(env)
        return 'erro_definitivo'
      }
      env.set('ultimo_erro', st === 429 ? 'dapi_http_429' : 'dapi_http_5xx')
      env.set('estado', tent >= 3 ? 'erro_definitivo' : 'erro')
      $app.save(env)
      return String(env.get('estado'))
    }

    function enfileirar(conexao, destino, motivoEnvio, texto, modelo, variaveis, chave) {
      try {
        const ja = $app.findRecordsByFilter(colEnv, "dedupe_key='" + chave + "'", '', 1, 0)
        if (ja && ja.length > 0) return ja[0].id
      } catch (eD) {}
      const aberta = janelaAberta(conexao, destino)
      const env = new Record(colEnv)
      env.set('lead', leadId)
      env.set('conexao', String(conexao.id))
      env.set('destino_telefone', destino)
      env.set('motivo', motivoEnvio)
      env.set('variaveis', variaveis)
      env.set('dedupe_key', chave)
      env.set('tentativas', 0)
      env.set('fixture', ehFixture)
      env.set('texto', texto)
      if (aberta) {
        env.set('modo', 'texto')
        env.set('estado', 'pendente')
      } else if (String(modelo || '') === '') {
        // fora da janela e sem modelo aprovado: não dá para mandar texto livre
        env.set('modo', 'modelo')
        env.set('estado', 'fora_da_janela_sem_modelo')
        $app.save(env)
        return env.id
      } else {
        env.set('modo', 'modelo')
        env.set('modelo_nome', String(modelo))
        env.set('estado', 'pendente')
      }
      $app.save(env)
      processar(env)
      return env.id
    }

    var numValido = false
    try {
      const nd = numeroVendedor.replace(/\D/g, '')
      if (nd.indexOf('55') === 0 && (nd.length === 12 || nd.length === 13)) numValido = true
    } catch (eNv) {}

    if (numValido) {
      const textoVendedor =
        'Você recebeu um novo lead para atendimento! Nome: ' +
        String(lead.get('nome') || '') +
        ' · Telefone: ' +
        telefoneCliente +
        ' · Canal: ' +
        String(lead.get('origem') || 'whatsapp') +
        '. Responda o cliente pelo seu WhatsApp.'
      // ---------- MODELO APROVADO (03/11) ----------
      // O aviso ao vendedor cai fora da janela de 24h na maioria dos casos
      // (erro 131047 "Re-engagement message"). Texto livre só passa dentro da
      // janela; fora dela, só template aprovado pela Meta.
      // O nome do modelo vem da conexão (`modelo_aviso_vendedor`); quando o dono
      // aprovar, o campo já aponta para ele e o envio passa a usar template.
      // ---------- CA-3-68 / RN-137 (05/11) — CUSTO ZERO POR PADRÃO ----------
      // Decisão do dono: a apresentação por modelo pago fica DESLIGADA até a
      // gestão autorizar na Administração. Enquanto estiver desligada, NADA
      // sai pelo número do vendedor — nem aviso por modelo, nem apresentação.
      // O vendedor descobre o lead pelo CRM e por "Clientes para recontatar".
      //
      // Texto livre só é permitido se a janela com o VENDEDOR estiver aberta
      // (RN-137). Fora dela, nenhum envio.
      const apresentacaoLigada = conexaoVendedor
        ? conexaoVendedor.get('apresentacao_ativa') === true
        : false
      const modeloApresentacao = conexaoVendedor
        ? String(conexaoVendedor.get('modelo_apresentacao_vendedor') || '')
        : ''
      if (!apresentacaoLigada || modeloApresentacao === '') {
        // registra que não saiu, para a gestão ver o motivo — sem criar envio
        try {
          const colEvS = $app.findCollectionByNameOrId('crm_lead_events')
          const evS = new Record(colEvS)
          evS.set('lead_id', lead.id)
          evS.set('tipo', 'nota')
          evS.set(
            'texto',
            'Aviso ao vendedor NÃO enviado: apresentação desligada (CA-3-68). O lead aparece no CRM e em Clientes para recontatar.',
          )
          evS.set('fixture', ehFixture)
          $app.save(evS)
        } catch (eSil) {}
      }
      var id = null
      if (apresentacaoLigada && modeloApresentacao !== '') {
        id = enfileirar(
          conexaoVendedor,
          numeroVendedor,
          'apresentacao_vendedor',
          textoVendedor,
          modeloApresentacao,
          // variáveis do modelo, na ordem: {{1}} nome, {{2}} telefone, {{3}} canal
          {
            nome: String(lead.get('nome') || ''),
            telefone: telefoneCliente,
            canal: String(lead.get('origem') || 'whatsapp'),
          },
          'apresentacao|' + leadId,
        )
      }
      if (id) envios.push(id)
    }

    if (telefoneCliente !== '' && central) {
      const textoCliente =
        'Quem vai te atender é *' +
        vendedorNome +
        '*, do nosso time de vendas. Nos próximos minutos você recebe uma mensagem' +
        (numeroVendedor ? ' pelo número *' + numeroVendedor + '*' : '') +
        '. Pode salvar como *Haisan Vendas*! 😊'
      const id = enfileirar(
        central,
        telefoneCliente,
        'aviso_cliente',
        textoCliente,
        String(central.get('modelo_transferencia_cliente') || ''),
        { vendedor: vendedorNome, numero_vendedor: numeroVendedor },
        'transf_cliente_' + leadId,
      )
      if (id) envios.push(id)
    }

    tr.set('vendedor_user', vendedorId)
    tr.set('vendedor_nome', vendedorNome)
    tr.set('regra', regra)
    tr.set('envios', envios)
    tr.set('estado', envios.length > 0 ? 'concluida' : 'erro')
    tr.set('detalhe', envios.length > 0 ? '' : 'nenhum_envio_enfileirado')
    try {
      $app.save(tr)
    } catch (eSvT) {
      console.log('transferencias: save falhou -> ' + String(eSvT).slice(0, 160))
    }

    try {
      const convs = $app.findRecordsByFilter(colConv, "lead='" + leadId + "'", '', 20, 0)
      for (const c of convs) {
        c.set('estado', 'transferida')
        c.set('transferida_em', new Date().toISOString())
        $app.save(c)
      }
    } catch (eCv) {}
  } catch (e) {}
  e.next()
})
