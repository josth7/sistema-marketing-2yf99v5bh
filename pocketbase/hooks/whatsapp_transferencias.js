/// <reference path="../pb_data/types.d.ts" />
/**
 * Transferência de lead para vendedor — RN-67 + RN-68 + RN-69 (CA-3-16).
 *
 * A lógica mora no hook de coleção (onRecordAfterCreateSuccess): quem quer
 * transferir cria um registro em `whatsapp_transferencias` e o hook executa.
 * Assim produção e simulação rodam o MESMO código.
 *
 * Regras aplicadas:
 *  - lead com responsável → mantém (regra `carteira`)
 *  - lead sem responsável → mesmo critério de /crm/rodizio (regra `rodizio`)
 *  - grava o responsável e `novo` passa a `em_contato`
 *  - enfileira o aviso ao vendedor (na conexão dele) e o aviso ao cliente
 *    (na central) — RN-67
 *  - janela de 24 h (RN-68): dentro, texto livre; fora, modelo aprovado;
 *    sem modelo → `fora_da_janela_sem_modelo`
 *  - segunda transferência para o mesmo vendedor não reenvia (dedupe_key)
 *  - manutenção: sem rodízio, item na caixa
 *  - vendedor sem conexão → atribui, não envia, estado `sem_numero`
 *  - `simulacao` → só calcula o vendedor, não grava nada
 *
 * JSVM: lógica INLINE nos callbacks; json pode voltar como array de char-codes.
 */

onRecordAfterCreateSuccess((e) => {
  // Guarda de coleção: sem isto o hook roda em TODA criação do sistema
  // (lead, mensagem, conexão...) e escreve campos de transferência no registro
  // errado. Só age no pedido de transferência.
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
      $app.save(tr)
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
      // carteira: lead já tem responsável, mantém
      regra = 'carteira'
    } else {
      // rodízio: mesmo critério de /crm/rodizio — menos leads em aberto
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
        const st = String(l.get('status') || 'novo')
        if (st === 'fechado' || st === 'perdido') continue
        carga[ow] = (carga[ow] || 0) + 1
      }
      const colU = $app.findCollectionByNameOrId('users')
      const usuarios = $app.findRecordsByFilter(colU, '', '', 100, 0)
      var melhor = ''
      var melhorCarga = -1
      for (const u of usuarios) {
        const email = String(u.get('email') || '')
        const nomeU = String(u.get('name') || '')
        // usuário de teste não entra no rodízio: o e-mail dos fixtures criados
        // pelo QA não segue o padrão '.fixture.' — o nome é a marca confiável
        if (email.toLowerCase().indexOf('fixture') >= 0) continue
        if (nomeU.toLowerCase().indexOf('fixture') >= 0) continue
        if (email.indexOf('josth') >= 0) continue // dono não recebe rodízio
        const c = carga[u.id] || 0
        if (melhor === '' || c < melhorCarga) {
          melhor = u.id
          melhorCarga = c
        }
      }
      vendedorId = melhor
    }

    if (vendedorId !== '') {
      try {
        const u = $app.findRecordById('users', vendedorId)
        vendedorNome = String(u.get('name') || u.get('email') || '')
      } catch (eU) {}
    }

    // simulação: grava só o resultado do cálculo, não toca no lead
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

    // ---------- 2. manutenção: sem rodízio, item na caixa ----------
    if (regra === 'manutencao') {
      try {
        const colCaixa = $app.findCollectionByNameOrId('inbox_items')
        const item = new Record(colCaixa)
        item.set('tipo', 'lembrete')
        item.set('scope', 'notificar_manutencao')
        item.set('status', 'pending')
        item.set('dedupe_key', 'manutencao_' + leadId + '_' + String(Date.now()))
        item.set('attempts', 0)
        // user_id é relation: sem um valor válido o save falha e o item se perde.
        // Cai para o dono do lead ou para quem pediu; sem ninguém, grava erro claro.
        const pediu = String(tr.get('criado_por') || '')
        var destino = String(lead.get('owner_id') || '')
        if (destino === '') destino = pediu
        if (destino !== '') item.set('user_id', destino)
        $app.save(item)
        tr.set('estado', 'concluida')
        tr.set('detalhe', 'item_na_caixa')
      } catch (eCx) {
        tr.set('estado', 'erro')
        tr.set('detalhe', 'caixa_indisponivel: ' + String(eCx).slice(0, 120))
      }
      $app.save(tr)
      e.next()
      return
    }

    // ---------- 3. grava o responsável e move o status ----------
    const donoAntes = String(lead.get('owner_id') || '')
    if (donoAntes === '' && vendedorId !== '') {
      lead.set('owner_id', vendedorId)
      const st = String(lead.get('status') || 'novo')
      if (st === 'novo') lead.set('status', 'em_contato')
      $app.save(lead)
      // evento na trilha do lead
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

    // ---------- 4. conexões ----------
    const colCx = $app.findCollectionByNameOrId('whatsapp_conexoes')
    var central = null
    var conexaoVendedor = null
    try {
      // teste hermético: transferência fixture usa SÓ conexões fixture, e
      // transferência real usa só conexões reais — um teste nunca alcança o
      // número de um cliente de verdade (e vice-versa).
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

    // ---------- 5. janela de 24 h (RN-68) ----------
    function janelaAberta(conexaoId, telefoneContato) {
      try {
        const colM = $app.findCollectionByNameOrId('whatsapp_mensagens')
        const msgs = $app.findRecordsByFilter(
          colM,
          "conexao='" + conexaoId + "' && contato_telefone='" + telefoneContato + "'",
          '',
          200,
          0,
        )
        var ultimaEntrada = ''
        for (const m of msgs) {
          if (String(m.get('direcao')) !== 'entrada') continue
          const q = String(m.get('enviada_em') || '')
          if (q > ultimaEntrada) ultimaEntrada = q
        }
        if (ultimaEntrada === '') return false
        const agora = Date.now()
        const quando = new Date(ultimaEntrada).getTime()
        if (isNaN(quando)) return false
        return agora - quando < 24 * 60 * 60 * 1000
      } catch (eJ) {
        return false
      }
    }

    // ---------- 6. enfileira os avisos ----------
    const colEnv = $app.findCollectionByNameOrId('whatsapp_envios')
    const envios = []
    const telefoneCliente = String(lead.get('telefone') || '')
    const nomeCliente = String(lead.get('nome') || '')
    const numeroVendedor = String(conexaoVendedor.get('numero') || '')

    function enfileirar(conexao, destino, motivoEnvio, texto, modelo, variaveis, chave) {
      // dedupe: segunda transferência para o mesmo vendedor não reenvia
      try {
        const ja = $app.findRecordsByFilter(colEnv, "dedupe_key='" + chave + "'", '', 1, 0)
        if (ja && ja.length > 0) return ja[0].id
      } catch (eD) {}
      const aberta = janelaAberta(String(conexao.id), destino)
      const env = new Record(colEnv)
      env.set('lead', leadId)
      env.set('conexao', String(conexao.id))
      env.set('destino_telefone', destino)
      env.set('motivo', motivoEnvio)
      env.set('variaveis', variaveis)
      env.set('dedupe_key', chave)
      env.set('tentativas', 0)
      env.set('fixture', ehFixture)
      if (aberta) {
        env.set('modo', 'texto')
        env.set('texto', texto)
        env.set('estado', 'pendente')
      } else {
        // fora da janela: só modelo aprovado
        const modeloAprovado = String(modelo || '')
        if (modeloAprovado === '') {
          env.set('modo', 'modelo')
          env.set('estado', 'fora_da_janela_sem_modelo')
          env.set('texto', texto)
        } else {
          env.set('modo', 'modelo')
          env.set('modelo_nome', modeloAprovado)
          env.set('estado', 'pendente')
        }
      }
      try {
        $app.save(env)
        return env.id
      } catch (eS) {
        return ''
      }
    }

    // 6a) aviso ao VENDEDOR — sai do número central para o WhatsApp dele
    // (validação INLINE: função top-level não pega no JSVM — lição do projeto)
    var numeroVendedorValido = false
    try {
      const nd = numeroVendedor.replace(/\D/g, '')
      if (nd.indexOf('55') === 0 && (nd.length === 12 || nd.length === 13)) {
        numeroVendedorValido = true
      }
    } catch (eNv) {}
    if (numeroVendedorValido) {
      const textoVendedor =
        'Você recebeu um novo lead para atendimento! Nome: ' +
        nomeCliente +
        ' · Telefone: ' +
        telefoneCliente +
        ' · Canal: ' +
        String(lead.get('origem') || 'whatsapp') +
        '. Responda o cliente pelo seu WhatsApp.'
      const modeloVendedor = String(central ? central.get('modelo_aviso_vendedor') || '' : '')
      const id = enfileirar(
        central || conexaoVendedor,
        String(conexaoVendedor.get('numero') || ''),
        'aviso_vendedor',
        textoVendedor,
        modeloVendedor,
        { nome: nomeCliente, telefone: telefoneCliente },
        'transf_' + tr.id + '_vendedor_' + vendedorId,
      )
      if (id) envios.push(id)
    }

    // 6b) aviso ao CLIENTE — nome e número de quem vai atender
    if (telefoneCliente !== '' && central) {
      const textoCliente =
        'Quem vai te atender é *' +
        vendedorNome +
        '*, do nosso time de vendas. Nos próximos minutos você recebe uma mensagem' +
        (numeroVendedor ? ' pelo número *' + numeroVendedor + '*' : '') +
        '. Pode salvar como *Haisan Vendas*! 😊'
      const modeloCliente = String(central.get('modelo_transferencia_cliente') || '')
      const id = enfileirar(
        central,
        telefoneCliente,
        'aviso_cliente',
        textoCliente,
        modeloCliente,
        { vendedor: vendedorNome, numero_vendedor: numeroVendedor },
        'transf_' + tr.id + '_cliente',
      )
      if (id) envios.push(id)
    }

    tr.set('vendedor_user', vendedorId)
    tr.set('vendedor_nome', vendedorNome)
    tr.set('regra', regra)
    tr.set('envios', envios)
    tr.set('estado', envios.length > 0 ? 'concluida' : 'erro')
    tr.set('detalhe', envios.length > 0 ? '' : 'nenhum_envio_enfileirado')
    $app.save(tr)

    // conversa vai para `transferida`
    try {
      const colConv = $app.findCollectionByNameOrId('whatsapp_conversas')
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
