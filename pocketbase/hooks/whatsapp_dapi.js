/// <reference path="../pb_data/types.d.ts" />
/**
 * WhatsApp oficial pela D-API — webhook de entrada (SPEC-3-005, CA-3-12 e CA-3-13).
 *
 * Rota: POST /backend/v1/whatsapp/dapi/{token}
 *
 * Autenticação (RN-51):
 *   - sessão real: token do caminho = DAPI_WEBHOOK_TOKEN (comparação em tempo
 *     constante), User-Agent com prefixo `Deliverify-Webhook/` e sessionId
 *     cadastrado e ativo em whatsapp_conexoes.
 *   - sessão fixture: só X-Fixture-Secret válido (o token do caminho é ignorado).
 *   Sem segredo no cofre → 503; token errado → 404; User-Agent errado → 403.
 *
 * Idempotência:
 *   - por evento: dedupe_key = sessionId + event + referência (UNIQUE em
 *     whatsapp_eventos) — a D-API só deduplica por 5 min, o resto é nosso.
 *   - por mensagem: UNIQUE(conexao, wa_message_id) em whatsapp_mensagens.
 *
 * Privacidade: whatsapp_eventos NÃO guarda telefone, nome nem texto.
 * JSVM: toda a lógica INLINE no callback (sem helper top-level).
 */

routerAdd('POST', '/backend/v1/whatsapp/dapi/{token}', (e) => {
  const inicio = Date.now()
  const tokenCaminho = String(e.request.pathValue('token') || '')
  const ua = String(e.request.header.get('User-Agent') || '')
  const ehWebhookDapi = ua.indexOf('Deliverify-Webhook/') === 0

  const body = e.requestInfo().body || {}
  const evento = String(body.event || '')
  const sessionId = String(body.sessionId || '')
  const traceId = String(body.traceId || '')
  const data = body.data || {}

  // ---------- 1. corpo inválido (RN-52) ----------
  if (evento === '' || sessionId === '' || !body.data) {
    return e.json(400, { ok: false, erro: 'corpo_invalido' })
  }

  // ---------- 2. sessão fixture ou real ----------
  const segredoFixture = String($secrets.get('FIXTURE_TICK_SECRET') || '')
  const headerFixture = String(e.request.header.get('X-Fixture-Secret') || '')
  var ehFixture = false
  if (segredoFixture !== '' && headerFixture !== '' && headerFixture === segredoFixture) {
    ehFixture = true
  }

  const segredoToken = String($secrets.get('DAPI_WEBHOOK_TOKEN') || '')
  if (!ehFixture) {
    // sessão real: exige o segredo configurado
    if (segredoToken === '') {
      return e.json(503, { ok: false, erro: 'canal_indisponivel' })
    }
    // comparação em tempo constante (mesmo comprimento + XOR acumulado)
    var igual = tokenCaminho.length === segredoToken.length
    var dif = 0
    const n = Math.max(tokenCaminho.length, segredoToken.length)
    for (let i = 0; i < n; i++) {
      dif = dif | ((tokenCaminho.charCodeAt(i) || 0) ^ (segredoToken.charCodeAt(i) || 0))
    }
    if (!igual || dif !== 0) {
      // token errado: soma a recusa na conexão (se conhecida) e responde 404
      try {
        const colC0 = $app.findCollectionByNameOrId('whatsapp_conexoes')
        const c0 = $app.findRecordsByFilter(
          colC0,
          "session_id='" + sessionId.replace(/'/g, '') + "'",
          '',
          1,
          0,
        )
        if (c0 && c0.length > 0) {
          c0[0].set('recusas_token', Number(c0[0].get('recusas_token') || 0) + 1)
          $app.save(c0[0])
        }
      } catch (eR) {}
      return e.json(404, { ok: false, erro: 'token_invalido' })
    }
    // User-Agent da D-API (RN-51)
    if (!ehWebhookDapi) {
      return e.json(403, { ok: false, erro: 'origem_invalida' })
    }
  }

  // ---------- 3. conexão cadastrada e ativa (RN-53) ----------
  const colConexoes = $app.findCollectionByNameOrId('whatsapp_conexoes')
  var conexao = null
  try {
    const achadas = $app.findRecordsByFilter(
      colConexoes,
      "session_id='" + sessionId.replace(/'/g, '') + "'",
      '',
      1,
      0,
    )
    if (achadas && achadas.length > 0) conexao = achadas[0]
  } catch (eC) {}

  // grava o log técnico do evento (sem dado pessoal)
  function logarEvento(dedupeKey, refId, resultado, codigoErro) {
    try {
      const colEv = $app.findCollectionByNameOrId('whatsapp_eventos')
      const ev = new Record(colEv)
      ev.set('dedupe_key', dedupeKey.slice(0, 200))
      ev.set('evento', evento.slice(0, 60))
      ev.set('session_id', sessionId.slice(0, 80))
      ev.set('ref_id', String(refId || '').slice(0, 120))
      ev.set('resultado', resultado)
      ev.set('codigo_erro', String(codigoErro || '').slice(0, 60))
      ev.set('trace_id', traceId.slice(0, 120))
      ev.set('duracao_ms', Date.now() - inicio)
      ev.set('recebido_em', new Date().toISOString())
      ev.set('fixture', ehFixture)
      $app.save(ev)
      return true
    } catch (eL) {
      // UNIQUE do dedupe_key = evento repetido
      return false
    }
  }

  // referência do evento para o dedupe (RN-55)
  var refId = String(data.id || data.message_id || '')
  if (evento === 'message.delivered' || evento === 'message.read' || evento === 'message.deleted') {
    refId = String(data.message_id || '')
  }
  const dedupeKey = sessionId + '|' + evento + '|' + refId

  if (!conexao) {
    logarEvento(dedupeKey, refId, 'sessao_desconhecida', '')
    return e.json(200, { ok: true, ignorado: 'sessao_desconhecida' })
  }
  if (String(conexao.get('ativo')) !== 'true') {
    logarEvento(dedupeKey, refId, 'sessao_inativa', '')
    return e.json(200, { ok: true, ignorado: 'sessao_inativa' })
  }

  // dedupe ANTES de processar: se o log já existe, o evento é repetido
  const colEventos = $app.findCollectionByNameOrId('whatsapp_eventos')
  try {
    const ja = $app.findRecordsByFilter(
      colEventos,
      "dedupe_key='" + dedupeKey.replace(/'/g, '') + "'",
      '',
      1,
      0,
    )
    if (ja && ja.length > 0) {
      return e.json(200, { ok: true, ignorado: 'duplicado' })
    }
  } catch (eDup) {}

  // marca o evento como recebido (o UNIQUE protege contra corrida)
  const gravouLog = logarEvento(dedupeKey, refId, 'gravada', '')
  if (!gravouLog) {
    return e.json(200, { ok: true, ignorado: 'duplicado' })
  }

  // atualiza o "último evento" da conexão (RN-54)
  try {
    conexao.set('ultimo_evento_em', new Date().toISOString())
    if (evento === 'connection.status') {
      conexao.set('ultimo_status_conexao', String(data.status || data.state || '').slice(0, 40))
      conexao.set('ultimo_status_em', new Date().toISOString())
    }
    $app.save(conexao)
  } catch (eU) {}

  // ---------- 4. histórico de contatos vai para a CARTEIRA ----------
  // CA-3-58 (05/11): antes o `history_sync` era registrado e DESCARTADO, então
  // a carteira do vendedor no CRM nascia vazia mesmo ele tendo centenas de
  // clientes no celular.
  //
  // Agora grava SÓ telefone e nome em `carteira_contatos`. Nenhum texto de
  // mensagem — o histórico serve para saber COM QUEM o vendedor já falou, não
  // O QUE foi dito. O marcador de texto da fixture não é gravado em lugar
  // nenhum (nem aqui, nem no bruto, nem nos eventos, nem no log).
  if (evento === 'history_sync') {
    var gravados = 0
    var ignorados = 0
    try {
      const colCart = $app.findCollectionByNameOrId('carteira_contatos')
      const contatos = data.contacts || data.contatos || []
      const lista = Array.isArray(contatos) ? contatos : []
      const numeroDeContatos = lista.length
      for (const ct of lista) {
        try {
          // telefone: só dígitos, do jid
          const jidC = String(ct.jid || ct.id || ct.phone || '')
          var telC = jidC.split('@')[0].replace(/[^0-9]/g, '')
          if (telC.length === 10 || telC.length === 11) telC = '55' + telC
          if (telC.length < 12 || telC.length > 15) {
            ignorados++
            continue
          }
          const nomeC = String(ct.name || ct.pushName || ct.notify || '')
            .trim()
            .slice(0, 200)
          // marcador de texto da fixture: recusa sem gravar nada
          if (
            nomeC.toLowerCase().indexOf('texto') >= 0 &&
            nomeC.toLowerCase().indexOf('fixture') >= 0
          ) {
            ignorados++
            continue
          }
          const chaveC = String(conexao.id) + '|' + telC
          var jaTem = false
          try {
            const ex = $app.findRecordsByFilter(colCart, "dedupe_key='" + chaveC + "'", '', 1, 0)
            if (ex && ex.length > 0) jaTem = true
          } catch (eJ) {}
          if (jaTem) continue
          const rc = new Record(colCart)
          rc.set('telefone', telC)
          rc.set('nome', nomeC)
          rc.set('conexao', String(conexao.id))
          rc.set('vendedor_user', String(conexao.get('vendedor_user') || ''))
          rc.set('origem_carteira', 'history_sync')
          rc.set('lote', 'hist-' + String(conexao.id).slice(0, 10))
          rc.set('fixture', ehFixture)
          rc.set('dedupe_key', chaveC)
          $app.save(rc)
          gravados++
        } catch (eCt) {
          ignorados++
        }
      }
      // registro do bruto: só a CONTAGEM, sem conteúdo
      try {
        const colB = $app.findCollectionByNameOrId('whatsapp_historico_bruto')
        const rb = new Record(colB)
        rb.set('conexao', String(conexao.id))
        rb.set('tipo_evento', 'history_sync')
        rb.set('quantidade', numeroDeContatos)
        rb.set('guardado_em', new Date().toISOString())
        rb.set('fixture', ehFixture)
        $app.save(rb)
      } catch (eB) {}
    } catch (eHist) {}
    return e.json(200, {
      ok: true,
      registrado: evento,
      carteira_gravados: gravados,
      carteira_ignorados: ignorados,
    })
  }

  // ---------- eventos que só registram ----------
  if (evento === 'session.created') {
    return e.json(200, { ok: true, registrado: evento })
  }

  const colMensagens = $app.findCollectionByNameOrId('whatsapp_mensagens')

  // ---------- 5. status de mensagem (RN-64) ----------
  if (evento === 'message.delivered' || evento === 'message.read') {
    const mid = String(data.message_id || '').toLowerCase()
    var achou = null
    try {
      const r = $app.findRecordsByFilter(
        colMensagens,
        "conexao='" + conexao.id + "' && wa_message_id='" + mid.replace(/'/g, '') + "'",
        '',
        1,
        0,
      )
      if (r && r.length > 0) achou = r[0]
    } catch (eS) {}
    if (!achou) {
      return e.json(200, { ok: true, ignorado: 'status_pendente' })
    }
    const novo = evento === 'message.read' ? 'lida' : 'entregue'
    const atual = String(achou.get('status') || '')
    const ordem = { enviada: 1, entregue: 2, lida: 3 }
    if ((ordem[novo] || 0) > (ordem[atual] || 0)) {
      achou.set('status', novo)
      achou.set('status_em', new Date().toISOString())
      try {
        $app.save(achou)
      } catch (eSv) {}
    }
    return e.json(200, { ok: true, status: novo })
  }

  // ---------- 5b. falha de envio (message.failed) ----------
  // A D-API devolve 200 no POST, mas o status FINAL vem por este evento —
  // com o motivo da Meta (ex.: fora da janela de 24h, número sem WhatsApp).
  // Sem tratar, a fila dizia "enviado" e a mensagem morria na Meta em silêncio
  // (aconteceu 30/10: vendedor respondeu, cliente não recebeu).
  if (evento === 'message.failed') {
    const mid = String(data.message_id || data.id || '').toLowerCase()
    var achouF = null
    try {
      const rF = $app.findRecordsByFilter(
        colMensagens,
        "conexao='" + conexao.id + "' && wa_message_id='" + mid.replace(/'/g, '') + "'",
        '',
        1,
        0,
      )
      if (rF && rF.length > 0) achouF = rF[0]
    } catch (eSF) {}
    // CA-3-108 (09/11): a D-API manda `error` como TEXTO, não objeto.
    // Formato real capturado: {"success":false,"error":"(#131009) Parameter
    // value is not valid"}. O código lia `data.error.message`, que em texto é
    // `undefined` — então caía em "falha_nao_informada" e o vendedor ficava
    // sem saber o motivo.
    // FORMATO REAL DO `message.failed` (capturado em 10/11, dois casos reais):
    //   { message_id, remote_jid, participant, timestamp,
    //     error_code, error_title, error_details }
    // Não existe `error` (objeto nem texto). O código lia `data.error.message`
    // e caía em "falha_nao_informada" — o vendedor nunca sabia o motivo.
    function extrairMotivo(d) {
      if (!d) return ''
      // 1. FORMATO REAL da Meta no message.failed
      if (d.error_title) return String(d.error_title)
      if (d.error_details) return String(d.error_details)
      // 2. `error` como texto (recusa da D-API no envio)
      if (typeof d.error === 'string' && d.error !== '') return d.error
      // 3. `error` como objeto (formato antigo)
      if (d.error && typeof d.error === 'object') {
        const m = d.error.message || d.error.title || d.error.error_data || ''
        if (m !== '') return String(m)
      }
      // 4. outros
      if (d.reason) return String(d.reason)
      if (d.message) return String(d.message)
      if (d.title) return String(d.title)
      // 5. último recurso: só o código, para não dizer "não informada"
      if (d.error_code) return 'codigo ' + String(d.error_code)
      return ''
    }
    const brutoMotivo = extrairMotivo(data)
    const motivoFalha = String(brutoMotivo !== '' ? brutoMotivo : 'falha_nao_informada').slice(
      0,
      200,
    )
    // sem telefone (04/11): deixa a recusa da Meta visível no log do Skip
    console.log('whatsapp_dapi: Meta recusou um envio | ' + motivoFalha)

    // CA-3-86: recusa 131050 = o cliente pediu para parar as mensagens de
    // marketing. Vira opt-out na hora, igual ao "sair" digitado.
    // (131026/131048/131049 são problema de qualidade/bloqueio do número e NÃO
    // viram opt-out — esses contam para a pausa automática.)
    try {
      var codFalha = ''
      try {
        codFalha = String(
          data.error_code ||
            (data.error && (data.error.code || data.error.error_code || data.error.subcode)) ||
            data.code ||
            '',
        )
      } catch (eCod) {}
      if (codFalha === '') {
        const mCod = motivoFalha.match(/(\d{5,6})/)
        if (mCod) codFalha = mCod[1]
      }
      if (codFalha === '131050' && telefone !== '') {
        var jaOO = false
        try {
          const colOO2 = $app.findCollectionByNameOrId('opt_out')
          const ex2 = $app.findRecordsByFilter(colOO2, "telefone='" + telefone + "'", '', 1, 0)
          if (ex2 && ex2.length > 0) jaOO = true
          if (!jaOO) {
            const oo2 = new Record(colOO2)
            oo2.set('telefone', telefone)
            oo2.set('motivo', 'Meta 131050 (cliente parou marketing)')
            oo2.set('origem', 'meta')
            oo2.set('criado_em', new Date().toISOString())
            oo2.set('fixture', ehFixture)
            $app.save(oo2)
          }
        } catch (eOO2) {}
        try {
          const colD2 = $app.findCollectionByNameOrId('campanha_destinos')
          const ds2 = $app.findRecordsByFilter(
            colD2,
            "telefone='" + telefone + "' && estado='na_fila'",
            '',
            500,
            0,
          )
          for (const d2 of ds2) {
            d2.set('estado', 'optout')
            $app.save(d2)
          }
        } catch (eDO2) {}
      }
    } catch (eOptOutMeta) {}
    if (achouF) {
      achouF.set('status', 'falhou')
      achouF.set('status_em', new Date().toISOString())
      try {
        $app.save(achouF)
      } catch (eSvF) {}
    }
    // marca o envio da fila para aparecer na tela
    try {
      const colEnvF = $app.findCollectionByNameOrId('whatsapp_envios')
      const envs = $app.findRecordsByFilter(
        colEnvF,
        "wa_message_id='" + mid.replace(/'/g, '') + "'",
        '',
        1,
        0,
      )
      if (envs && envs.length > 0) {
        envs[0].set('estado', 'erro_definitivo')
        envs[0].set('ultimo_erro', 'meta: ' + motivoFalha)
        $app.save(envs[0])
      }
    } catch (eEnvF) {}
    // guarda o recorte cru do payload (sem telefone/nome) para descobrir a causa
    var recorte = ''
    try {
      const copia = {}
      copia.chaves = Object.keys(data).slice(0, 25).join(',')
      copia.error = data.error || null
      copia.status = data.status || ''
      copia.reason = data.reason || ''
      copia.code = data.code || data.error_code || ''
      copia.error_title = data.error_title || ''
      copia.error_details = data.error_details || ''
      copia.details = data.details || null
      recorte = JSON.stringify(copia).slice(0, 900)
    } catch (eRec) {}
    // o registro do evento JÁ existe (criado como 'gravada' no início):
    // atualizar em vez de inserir (dedupe_key tem UNIQUE)
    try {
      const colEv2 = $app.findCollectionByNameOrId('whatsapp_eventos')
      const registro = $app.findRecordsByFilter(
        colEv2,
        "dedupe_key='" + dedupeKey.replace(/'/g, '') + "'",
        '',
        1,
        0,
      )
      if (registro && registro.length > 0) {
        registro[0].set('resultado', 'falha_meta')
        registro[0].set('codigo_erro', (motivoFalha + ' | ' + recorte).slice(0, 900))
        $app.save(registro[0])
      }
    } catch (eUp) {}
    return e.json(200, { ok: true, falha: motivoFalha })
  }

  // ---------- 6. mensagem apagada (RN-65) ----------
  if (evento === 'message.deleted') {
    const mid = String(data.message_id || '').toLowerCase()
    try {
      const r = $app.findRecordsByFilter(
        colMensagens,
        "conexao='" + conexao.id + "' && wa_message_id='" + mid.replace(/'/g, '') + "'",
        '',
        1,
        0,
      )
      if (r && r.length > 0) {
        r[0].set('apagada_em', new Date().toISOString())
        r[0].set('texto', '')
        r[0].set('media_url', '')
        $app.save(r[0])
        return e.json(200, { ok: true, apagada: true })
      }
    } catch (eDel) {}
    return e.json(200, { ok: true, ignorado: 'ref_nao_encontrada' })
  }

  // ---------- 7. mensagem recebida / enviada pela API ----------
  if (evento !== 'messages.received' && evento !== 'messages.sent') {
    return e.json(200, { ok: true, ignorado: 'ignorado_tipo' })
  }

  // grupo fica fora do CRM (RN-56)
  if (data.is_group === true) {
    return e.json(200, { ok: true, ignorado: 'ignorado_grupo' })
  }

  const fromMe = data.fromMe === true
  const tipo = String(data.type || 'outro')
  const ehEdicao = tipo === 'edited_message'

  // quem é o contato (RN-57): fromMe recebido/sent → 'to'; senão 'from'
  const lado = fromMe ? data.to || {} : data.from || {}
  const jid = String(lado.jid || '')
  const lid = String(lado.lid || '')

  // telefone: dígitos do jid antes do @, no formato do crm_leads (só dígitos)
  var telefone = ''
  if (jid.indexOf('@lid') >= 0) {
    telefone = ''
  } else if (jid.indexOf('@') > 0) {
    telefone = jid.split('@')[0].replace(/[^0-9]/g, '')
  } else {
    telefone = jid.replace(/[^0-9]/g, '')
  }
  if (telefone.length === 10 || telefone.length === 11) telefone = '55' + telefone
  if (telefone.length < 12 || telefone.length > 15) telefone = ''

  // ---------- CA-3-74 (05/11): MESMO CLIENTE, SEM DUPLICAR ----------
  // O WhatsApp às vezes manda o celular SEM o 9 depois do DDD, e às vezes manda
  // só um `@lid` (sem número). Sem tratar, o mesmo cliente virava dois leads e
  // duas linhas (caso apontado pela Sabrina).
  //
  // Aqui se calculam todas as formas do MESMO telefone, e a busca usa todas.
  //   - variantes: com 9 e sem 9, para 12 e 13 dígitos
  //   - lid: quando o jid é @lid, o número vem vazio — então procura-se a
  //     conversa pelo `contato_lid` gravado antes.
  var telefonesBusca = []
  if (telefone !== '') {
    telefonesBusca.push(telefone)
    const ddd = telefone.slice(2, 4)
    const resto = telefone.slice(4)
    if (telefone.length === 13 && resto.charAt(0) === '9') {
      // com 9 -> também procura sem o 9
      telefonesBusca.push('55' + ddd + resto.slice(1))
    } else if (telefone.length === 12) {
      // sem 9 -> também procura com o 9
      telefonesBusca.push('55' + ddd + '9' + resto)
    }
  }

  // mensagem entre números da empresa (RN-58)
  if (telefone !== '') {
    try {
      const outras = $app.findRecordsByFilter(colConexoes, "numero='" + telefone + "'", '', 1, 0)
      if (outras && outras.length > 0) {
        return e.json(200, { ok: true, ignorado: 'entre_numeros_da_empresa' })
      }
    } catch (eO) {}
    // ---------- linha interna da equipe (CA-3-25) ----------
    // Antes: mensagem de número da equipe era DESCARTADA. Isso fazia a conversa
    // da equipe sumir — e o dono pediu justamente o contrário: separar.
    // Agora: não vira lead, não aciona o robô, e a conversa é gravada com
    // `interna=true` para aparecer na aba "Equipe" da tela Conversas.
    // ---------- CA-3-73 (05/11): quem NÃO é cliente ----------
    // Transportadora, fornecedor, outra empresa. Se o telefone já foi marcado
    // como "não é cliente" (em qualquer conexão), a mensagem NÃO cria lead,
    // NÃO entra no rodízio e o robô NÃO responde. Só grava o histórico.
    var ehNaoCliente = false
    var motivoNaoCliente = ''
    try {
      const colCvNC = $app.findCollectionByNameOrId('whatsapp_conversas')
      const jaNC = $app.findRecordsByFilter(
        colCvNC,
        "contato_telefone='" + telefone + "' && nao_cliente=true",
        '',
        1,
        0,
      )
      if (jaNC && jaNC.length > 0) {
        ehNaoCliente = true
        motivoNaoCliente = String(jaNC[0].get('nao_cliente_motivo') || '')
      }
    } catch (eNC) {}

    var ehNumeroInterno = false
    var rotuloInterno = ''
    try {
      const colInt = $app.findCollectionByNameOrId('whatsapp_numeros_internos')
      const ints = $app.findRecordsByFilter(colInt, "numero='" + telefone + "'", '', 1, 0)
      if (ints && ints.length > 0) {
        ehNumeroInterno = true
        rotuloInterno = String(ints[0].get('rotulo') || 'Equipe Haisan')
      }
    } catch (eInt) {}

    if (ehNumeroInterno) {
      // grava a conversa interna (uma por contato + conexao) e a mensagem.
      // NÃO cria lead, NÃO entra na triagem, o robô nunca responde.
      var msgIdInt = ''
      try {
        const colCvI = $app.findCollectionByNameOrId('whatsapp_conversas')
        var cvI = null
        try {
          const achadas = $app.findRecordsByFilter(
            colCvI,
            "conexao='" + conexao.id + "' && contato_telefone='" + telefone + "'",
            '',
            1,
            0,
          )
          if (achadas && achadas.length > 0) cvI = achadas[0]
        } catch (eCvI) {}
        if (!cvI) {
          const nc = new Record(colCvI)
          nc.set('conexao', conexao.id)
          nc.set('contato_telefone', telefone)
          nc.set('contato_nome', rotuloInterno || String(lado.name || 'Equipe'))
          nc.set('estado', 'sem_ia')
          nc.set('interna', true)
          nc.set('total_mensagens', 0)
          nc.set('fixture', ehFixture)
          $app.save(nc)
          cvI = nc
        } else {
          try {
            cvI.set('interna', true)
            $app.save(cvI)
          } catch (eMarca) {}
        }
        // mensagem
        try {
          const colMens = $app.findCollectionByNameOrId('whatsapp_mensagens')
          const msg = new Record(colMens)
          msg.set('conexao', conexao.id)
          msg.set('wa_message_id', String(data.id || '').toLowerCase())
          msg.set('lead', '')
          msg.set('vinculo', 'interno')
          msg.set('contato_telefone', telefone)
          msg.set('contato_nome', rotuloInterno || String(lado.name || 'Equipe'))
          msg.set('direcao', data.fromMe === true ? 'saida' : 'entrada')
          msg.set('autor', 'equipe_central')
          msg.set('tipo', String(data.type || 'text'))
          msg.set(
            'texto',
            String(data.message || (data.media_data || {}).caption || '').slice(0, 10000),
          )
          msg.set('status', 'recebida')
          msg.set('recebida_em', new Date().toISOString())
          msg.set('fixture', ehFixture)
          $app.save(msg)
          msgIdInt = msg.id
        } catch (eMsgI) {}
        // atualiza a previa da conversa
        try {
          cvI.set('ultima_mensagem_em', new Date().toISOString())
          cvI.set(
            'ultima_previa',
            String(data.message || (data.media_data || {}).caption || 'Mensagem').slice(0, 160),
          )
          cvI.set('ultimo_autor', data.fromMe === true ? 'equipe_central' : 'equipe_central')
          cvI.set('total_mensagens', Number(cvI.get('total_mensagens') || 0) + 1)
          $app.save(cvI)
        } catch (eUpI) {}
      } catch (eInt2) {}
      return e.json(200, {
        ok: true,
        interna: true,
        mensagem: msgIdInt,
        ignorado: 'conversa_interna_da_equipe',
      })
    }
  }

  // ---------- 8. busca do lead (RN-59) ----------
  const colLeads = $app.findCollectionByNameOrId('crm_leads')
  var lead = null

  // CA-3-74: quando o WhatsApp manda só `@lid` (sem número), o telefone fica
  // vazio e a busca normal não acha nada — o cliente ganhava um lead NOVO.
  // Aqui se acha o lead pela conversa que já tem esse `contato_lid`.
  if (telefone === '' && lid !== '') {
    try {
      const cvLid = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_conversas'),
        "contato_lid='" + lid.slice(0, 80) + "'",
        '',
        1,
        0,
      )
      if (cvLid && cvLid.length > 0) {
        const leadIdLid = String(cvLid[0].get('lead') || '')
        if (leadIdLid !== '') {
          try {
            lead = $app.findRecordById(colLeads, leadIdLid)
          } catch (eLid) {}
        }
        // herda o telefone da conversa existente (o cliente já era conhecido)
        const telDaConversa = String(cvLid[0].get('contato_telefone') || '')
        if (telDaConversa !== '') {
          telefone = telDaConversa
          telefonesBusca = [telDaConversa]
        }
      }
    } catch (eLidBusca) {}
  }

  if (telefone !== '') {
    try {
      const r = $app.findRecordsByFilter(
        colLeads,
        "telefone='" + telefone + "' && fixture=" + (ehFixture ? 'true' : 'false'),
        '',
        1,
        0,
      )
      if (r && r.length > 0) lead = r[0]
    } catch (eL1) {}
    // tenta com e sem o nono dígito (celular brasileiro)
    if (!lead && telefone.length === 13 && telefone.slice(4, 5) === '9') {
      const semNove = telefone.slice(0, 4) + telefone.slice(5)
      try {
        const r2 = $app.findRecordsByFilter(
          colLeads,
          "telefone='" + semNove + "' && fixture=" + (ehFixture ? 'true' : 'false'),
          '',
          1,
          0,
        )
        if (r2 && r2.length > 0) lead = r2[0]
      } catch (eL2) {}
    }
    if (!lead && telefone.length === 12) {
      const comNove = telefone.slice(0, 4) + '9' + telefone.slice(4)
      try {
        const r3 = $app.findRecordsByFilter(
          colLeads,
          "telefone='" + comNove + "' && fixture=" + (ehFixture ? 'true' : 'false'),
          '',
          1,
          0,
        )
        if (r3 && r3.length > 0) lead = r3[0]
      } catch (eL3) {}
    }
  }

  const papelConexao = String(conexao.get('papel') || '')
  const vendedorDaConexao = String(conexao.get('vendedor_user') || '')

  // ---------- 8b. CA-3-57 (05/11): CLIENTE DA CARTEIRA VAI AO DONO DELA ----------
  // A base das 4 carteiras (59.070 contatos) está em `carteira_contatos`. Se o
  // telefone que escreve está na carteira de um vendedor, o lead NASCE com esse
  // dono — sem passar pelo rodízio. É a diferença entre "cliente do Fábio" e
  // "lead novo distribuído por sorte".
  //
  // Conflito (mesmo telefone em 2+ carteiras) NÃO escolhe sozinho: fica sem
  // dono e vira item em "precisa de ação", como manda a RN-157.
  var donoDaCarteira = ''
  var carteiraConflito = false
  if (!lead && telefone !== '') {
    try {
      const colCart = $app.findCollectionByNameOrId('carteira_contatos')
      // procura as variantes (com e sem o 9), como o resto do sistema
      var achadosCart = []
      for (var ic = 0; ic < telefonesBusca.length; ic++) {
        try {
          const rC = $app.findRecordsByFilter(
            colCart,
            "telefone='" + telefonesBusca[ic] + "'",
            '',
            20,
            0,
          )
          for (const rc of rC) achadosCart.push(rc)
        } catch (eC1) {}
      }
      if (achadosCart.length > 0) {
        const donos = {}
        for (const rc of achadosCart) {
          const u = String(rc.get('vendedor_user') || '')
          if (u !== '') donos[u] = true
        }
        const listaDonos = Object.keys(donos)
        if (listaDonos.length === 1) {
          donoDaCarteira = listaDonos[0]
        } else if (listaDonos.length > 1) {
          // conflito: não escolhe; a gestão decide
          carteiraConflito = true
          try {
            const colPA = $app.findCollectionByNameOrId('precisa_acao')
            const chavePA = 'conflito_carteira|' + telefone
            var jaPA = false
            try {
              const ex = $app.findRecordsByFilter(colPA, "dedupe_key='" + chavePA + "'", '', 1, 0)
              if (ex && ex.length > 0) jaPA = true
            } catch (ePA0) {}
            if (!jaPA) {
              const item = new Record(colPA)
              item.set('lead', '')
              item.set('dono_anterior', listaDonos.join(','))
              item.set('dono_anterior_nome', 'Carteira em conflito (' + telefone + ')')
              item.set('motivo', 'conflito_carteira')
              item.set('resolvido', false)
              item.set('fixture', ehFixture)
              item.set('dedupe_key', chavePA)
              $app.save(item)
            }
          } catch (ePA) {}
        }
      }
    } catch (eCart) {}
  }

  // ---------- 9. lead não encontrado: cria (RN-61) ----------
  // CA-3-73 (05/11): telefone marcado como "não é cliente" não cria lead.
  // Sem isso, a transportadora que manda mensagem virava lead e entrava no
  // rodízio — o vendedor recebia um "lead" que era o aviso de entrega.
  if (!lead && telefone !== '' && !fromMe && !ehNaoCliente) {
    // RN-198 (10/11): nome sem LETRA nem DÍGITO não serve — "." e emoji
    // deixavam o lead ilegível na tela (relato da Anézia). Vira
    // "Cliente final XXXX" com os 4 últimos dígitos do telefone.
    const nomeContato = String(lado.name || '').trim()
    function nomeLegivel(txt, tel) {
      const t = String(txt || '').trim()
      if (/[A-Za-zÀ-ÿ0-9]/.test(t)) return t.slice(0, 200)
      return (
        'Cliente final ' +
        String(tel || '')
          .replace(/[^0-9]/g, '')
          .slice(-4)
      )
    }
    const nomeLead = nomeLegivel(nomeContato, telefone)
    try {
      const novo = new Record(colLeads)
      novo.set('nome', nomeLead)
      novo.set('telefone', telefone)
      novo.set('origem', donoDaCarteira !== '' ? 'carteira' : 'whatsapp')
      // `novo` NAO EXISTE no funil de 10 etapas (mig 0097 renomeou para
      // `entrada_lead`). O set falhava no save e o catch vazio engolia: TODO
      // lead novo pelo WhatsApp ficava fora do CRM desde 30/10 — 12 clientes
      // reais do Google Ads entraram sem lead (03/11).
      novo.set('status', 'entrada_lead')
      novo.set('conta_id', 'haisan')
      novo.set('fixture', ehFixture)
      novo.set('entrada_whatsapp', conexao.id)
      // número do vendedor → o lead nasce com ele; central → sem responsável
      // CA-3-57: dono vem da CARTEIRA (sem rodízio). Se o telefone está na
      // carteira de exatamente um vendedor, ele já nasce dono. Conflito fica
      // sem dono e vira item em "precisa de ação" — nunca cai num terceiro.
      // Conexão de vendedor continua mandando (quem falou com ele responde).
      var donoInicial = papelConexao === 'vendedor' ? vendedorDaConexao : donoDaCarteira
      if (carteiraConflito) donoInicial = ''
      novo.set('owner_id', donoInicial)
      novo.set(
        'vendedor_nome',
        papelConexao === 'vendedor' ? String(conexao.get('vendedor_nome_publico') || '') : '',
      )
      $app.save(novo)
      lead = novo
      // evento na trilha
      try {
        const colEvL = $app.findCollectionByNameOrId('crm_lead_events')
        const evL = new Record(colEvL)
        evL.set('lead_id', novo.id)
        evL.set('tipo', 'criado')
        evL.set(
          'texto',
          'Lead criado pelo WhatsApp — entrou por ' + String(conexao.get('nome_exibicao') || ''),
        )
        evL.set('fixture', ehFixture)
        $app.save(evL)
      } catch (eEvL) {}
    } catch (eNovo) {
      // Relê o telefone: o caso comum é UNIQUE (corrida) — mas ANTES eu
      // assumia "duplicado" para QUALQUER erro e o catch vazio escondia
      // falha real de schema. Agora registra o erro de verdade no log, para
      // nunca mais passar 4 dias criando zero lead sem ninguém ver (03/11).
      try {
        const rr = $app.findRecordsByFilter(colLeads, "telefone='" + telefone + "'", '', 1, 0)
        if (rr && rr.length > 0) lead = rr[0]
        else console.log('whatsapp_dapi: FALHA ao criar lead ' + telefone + ': ' + String(eNovo))
      } catch (eRel) {
        console.log(
          'whatsapp_dapi: FALHA ao criar lead ' + telefone + ' (e releitura): ' + String(eNovo),
        )
      }
    }
  }

  // ---------- 10. autor (RN-62) ----------
  var autor = 'cliente'
  var autorUser = ''
  var direcao = 'entrada'
  if (evento === 'messages.sent') {
    direcao = 'saida'
    // envio do sistema? casa pelo wa_message_id do envio (RN-63)
    autor = 'api_externa'
    try {
      const colEnv = $app.findCollectionByNameOrId('whatsapp_envios')
      const env = $app.findRecordsByFilter(
        colEnv,
        "wa_message_id='" +
          String(data.id || '')
            .toLowerCase()
            .replace(/'/g, '') +
          "'",
        '',
        1,
        0,
      )
      if (env && env.length > 0) {
        const motivo = String(env[0].get('motivo') || '')
        if (motivo.indexOf('ia_') === 0) autor = 'ia'
        else if (motivo.indexOf('vendedor_') === 0) {
          // resposta enviada PELO SISTEMA por um humano — não é 'sistema'
          autor = 'vendedor'
          autorUser = String(env[0].get('autor_user') || '')
        } else autor = 'sistema'
      }
    } catch (eEnv) {}
  } else if (fromMe) {
    direcao = 'saida'
    autor = papelConexao === 'vendedor' ? 'vendedor' : 'equipe_central'
    // casa com envio do sistema (RN-63): se for resposta da IA, não é humano
    try {
      const colEnv2 = $app.findCollectionByNameOrId('whatsapp_envios')
      const env2 = $app.findRecordsByFilter(
        colEnv2,
        "wa_message_id='" +
          String(data.id || '')
            .toLowerCase()
            .replace(/'/g, '') +
          "'",
        '',
        1,
        0,
      )
      if (env2 && env2.length > 0) {
        const motivo2 = String(env2[0].get('motivo') || '')
        if (motivo2.indexOf('ia_') === 0) autor = 'ia'
        else if (motivo2.indexOf('vendedor_') === 0) {
          autor = 'vendedor'
          autorUser = String(env2[0].get('autor_user') || '')
        } else autor = 'sistema'
      }
    } catch (eEnv2) {}
  }

  // ---------- 11. grava a mensagem ----------
  const waId = String(data.id || '').toLowerCase()
  if (waId === '') {
    return e.json(200, { ok: true, ignorado: 'ignorado_tipo' })
  }

  const mediaData = data.media_data || {}
  const textoMsg = String(data.message || mediaData.caption || '').slice(0, 10000)

  // ---------- CA-3-86 (06/11): PEDIDO DE SAÍDA ----------
  // Cliente que responde "sair" não quer mais receber campanha. A regra é
  // EXATA: só a palavra sozinha vale (sair, parar, pare, cancelar, remover,
  // descadastrar), normalizada. "sair por favor" NÃO é pedido — é conversa,
  // e a SPEC é explícita nisso.
  //
  // Vale para todas as campanhas (o opt-out é do telefone, não da campanha).
  if (!fromMe && textoMsg !== '' && telefone !== '') {
    try {
      const norm = textoMsg
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .toLowerCase()
        .replace(/[.,!?;:]/g, '')
        .trim()
      const PEDIDOS = ['sair', 'parar', 'pare', 'cancelar', 'remover', 'descadastrar']
      if (PEDIDOS.indexOf(norm) >= 0) {
        var jaTem = false
        try {
          const colOO = $app.findCollectionByNameOrId('opt_out')
          const ex = $app.findRecordsByFilter(colOO, "telefone='" + telefone + "'", '', 1, 0)
          if (ex && ex.length > 0) jaTem = true
          if (!jaTem) {
            const oo = new Record(colOO)
            oo.set('telefone', telefone)
            oo.set('motivo', 'respondeu "' + norm + '"')
            oo.set('origem', 'whatsapp')
            oo.set('criado_em', new Date().toISOString())
            oo.set('fixture', ehFixture)
            $app.save(oo)
          }
        } catch (eOO) {}
        // tira da fila das campanhas na hora
        try {
          const colD = $app.findCollectionByNameOrId('campanha_destinos')
          const ds = $app.findRecordsByFilter(
            colD,
            "telefone='" + telefone + "' && estado='na_fila'",
            '',
            500,
            0,
          )
          for (const d of ds) {
            d.set('estado', 'optout')
            $app.save(d)
          }
        } catch (eDO) {}
      }
    } catch (eOptOut) {}
  }

  // ---------- 11b. ATRIBUIÇÃO DE ANÚNCIO (Click-to-WhatsApp) ----------
  // A Meta não manda "vi o anúncio" em texto: manda o objeto `referral` junto
  // da primeira mensagem de quem clicou no anúncio. O webhook ignorava isso
  // (03/11), então o lead ficava sem origem e sem atendimento.
  // Leitura DEFENSIVA: a D-API pode repassar o bloco com outro nome, então
  // procuro em data.referral, data.contextInfo.referral e data.message.referral.
  var ref = null
  try {
    if (data.referral && typeof data.referral === 'object') ref = data.referral
    else if (data.contextInfo && data.contextInfo.referral) ref = data.contextInfo.referral
    else if (data.message && typeof data.message === 'object' && data.message.referral)
      ref = data.message.referral
    else if (data.referral_data && typeof data.referral_data === 'object') ref = data.referral_data
  } catch (eRef) {}
  var anuncio = null
  if (ref) {
    var urlA = String(ref.source_url || ref.sourceUrl || '')
    var tipoA = String(ref.source_type || ref.sourceType || '')
    var idA = String(ref.source_id || ref.sourceId || ref.ad_id || ref.adId || '')
    var fonteA = ''
    if (urlA.indexOf('instagram') >= 0) fonteA = 'instagram'
    else if (urlA.indexOf('facebook') >= 0) fonteA = 'facebook'
    else if (tipoA !== '') fonteA = tipoA
    anuncio = {
      id: idA.slice(0, 120),
      tipo: tipoA.slice(0, 60),
      url: urlA.slice(0, 500),
      titulo: String(ref.headline || '').slice(0, 300),
      corpo: String(ref.body || '').slice(0, 1000),
      ctwa: String(ref.ctwa_clid || ref.ctwaClid || '').slice(0, 300),
      fonte: fonteA.slice(0, 60),
      // recorte para descobrir o nome real dos campos que a D-API repassa
      bruto: JSON.stringify(ref).slice(0, 1800),
    }
  }
  // A D-API manda `timestamp` em SEGUNDOS (ex.: 1761672000). Tratar como
  // milissegundos jogava a data para 1970 — provado em 28/10 com a primeira
  // mensagem real: veio "1970-01-21 18:06". Aceita os dois formatos: acima de
  // 1e11 já está em ms (equivale a ano > 5138 se fosse segundos).
  var tsBruto = Number(data.timestamp || 0)
  if (tsBruto > 0 && tsBruto < 100000000000) {
    tsBruto = tsBruto * 1000
  }
  const tsMs = tsBruto
  const enviadaEm = tsMs > 0 ? new Date(tsMs).toISOString() : new Date().toISOString()

  var msgId = ''
  try {
    const msg = new Record(colMensagens)
    msg.set('conexao', conexao.id)
    msg.set('wa_message_id', waId)
    msg.set('lead', lead ? lead.id : '')
    msg.set('vinculo', lead ? 'ok' : 'sem_telefone')
    msg.set('contato_telefone', telefone)
    msg.set('contato_lid', lid.slice(0, 80))
    msg.set('contato_nome', String(lado.name || '').slice(0, 200))
    msg.set('direcao', direcao)
    msg.set('autor', autor)
    msg.set(
      'autor_user',
      autor === 'vendedor' ? (autorUser !== '' ? autorUser : vendedorDaConexao) : '',
    )
    msg.set('evento_origem', evento)
    msg.set('tipo', tipo.slice(0, 40))
    msg.set('texto', textoMsg)
    msg.set('media_url', String(data.media_url || mediaData.url || '').slice(0, 500))
    msg.set(
      'media_url_temporaria',
      String(data.media_url || '') === '' && String(mediaData.url || '') !== '',
    )
    msg.set('media_mimetype', String(mediaData.mimetype || '').slice(0, 120))
    if (mediaData.duration) msg.set('media_duracao_s', Number(mediaData.duration))
    msg.set('media_ptt', mediaData.is_ptt === true)
    msg.set('media_nome_arquivo', String(mediaData.filename || '').slice(0, 300))
    if (data.external_ad_reply) {
      try {
        msg.set('anuncio_ref', data.external_ad_reply)
      } catch (eAd) {}
    }
    msg.set('enviada_em', enviadaEm)
    msg.set('recebida_em', new Date().toISOString())
    msg.set('status', direcao === 'entrada' ? 'recebida' : 'enviada')
    msg.set('trace_id', traceId.slice(0, 120))
    msg.set('fixture', ehFixture)
    $app.save(msg)
    msgId = msg.id
  } catch (eMsg) {
    // UNIQUE(conexao, wa_message_id): mesma mensagem já gravada
    return e.json(200, { ok: true, ignorado: 'duplicado' })
  }

  // ---------- 12. edição de mensagem (RN-65) ----------
  if (ehEdicao) {
    const originalId = String((data.data && data.data.original_message_id) || '').toLowerCase()
    if (originalId !== '') {
      try {
        const orig = $app.findRecordsByFilter(
          colMensagens,
          "conexao='" + conexao.id + "' && wa_message_id='" + originalId.replace(/'/g, '') + "'",
          '',
          1,
          0,
        )
        if (orig && orig.length > 0) {
          orig[0].set('texto_original', String(orig[0].get('texto') || ''))
          orig[0].set('texto', textoMsg)
          orig[0].set('editada_em', new Date().toISOString())
          $app.save(orig[0])
        }
      } catch (eEd) {}
    }
  }

  // ---------- 13. lead sem responsável que fala com o vendedor (RN-60) ----------
  if (lead && papelConexao === 'vendedor' && vendedorDaConexao !== '') {
    try {
      if (String(lead.get('owner_id') || '') === '') {
        lead.set('owner_id', vendedorDaConexao)
        lead.set('vendedor_nome', String(conexao.get('vendedor_nome_publico') || ''))
        $app.save(lead)
        const colEvL2 = $app.findCollectionByNameOrId('crm_lead_events')
        const evL2 = new Record(colEvL2)
        evL2.set('lead_id', lead.id)
        evL2.set('tipo', 'nota')
        evL2.set(
          'texto',
          'Responsável definido pelo WhatsApp: conversou com ' +
            String(conexao.get('nome_exibicao') || ''),
        )
        evL2.set('fixture', ehFixture)
        $app.save(evL2)
      }
    } catch (eOw) {}
  }

  // ---------- 14. conversa + sinais (CA-3-15) ----------
  // Uma conversa por numero + contato. `leitores` decide quem ve cada conversa
  // no tempo real e nas rotas; e recalculado a cada mensagem.
  try {
    const colConv = $app.findCollectionByNameOrId('whatsapp_conversas')
    const colSin = $app.findCollectionByNameOrId('whatsapp_sinais')
    var conversa = null
    if (telefone !== '') {
      // CA-3-74: procura por TODAS as formas do telefone e pelo @lid
      try {
        for (var iv = 0; iv < telefonesBusca.length && !conversa; iv++) {
          const achadas = $app.findRecordsByFilter(
            colConv,
            "conexao='" + conexao.id + "' && contato_telefone='" + telefonesBusca[iv] + "'",
            '',
            1,
            0,
          )
          if (achadas && achadas.length > 0) conversa = achadas[0]
        }
        if (!conversa && lid !== '') {
          const porLid = $app.findRecordsByFilter(
            colConv,
            "conexao='" + conexao.id + "' && contato_lid='" + lid.slice(0, 80) + "'",
            '',
            1,
            0,
          )
          if (porLid && porLid.length > 0) conversa = porLid[0]
        }
      } catch (eCv) {}
      if (!conversa) {
        try {
          const nc = new Record(colConv)
          nc.set('conexao', conexao.id)
          nc.set('contato_telefone', telefone)
          nc.set('contato_lid', lid.slice(0, 80))
          nc.set('contato_nome', String(lado.name || '').slice(0, 200))
          nc.set('lead', lead ? lead.id : '')
          nc.set('total_mensagens', 0)
          nc.set('estado', papelConexao === 'vendedor' ? 'sem_ia' : 'triagem')
          nc.set('fixture', ehFixture)
          $app.save(nc)
          conversa = nc
        } catch (eNC) {}
      }
    }
    if (conversa) {
      // previa curta (midia vira o tipo)
      var previa = textoMsg
      if (previa === '' && tipo !== 'text') {
        previa =
          tipo === 'audio'
            ? 'Áudio'
            : tipo === 'image'
              ? 'Imagem'
              : tipo === 'video'
                ? 'Vídeo'
                : tipo === 'document'
                  ? 'Documento'
                  : 'Mensagem'
      }
      try {
        conversa.set(
          'contato_nome',
          String(lado.name || conversa.get('contato_nome') || '').slice(0, 200),
        )
        conversa.set('lead', lead ? lead.id : String(conversa.get('lead') || ''))
        conversa.set('ultima_mensagem_em', enviadaEm)
        conversa.set('ultima_previa', String(previa).slice(0, 160))
        conversa.set('ultimo_autor', autor)
        conversa.set('total_mensagens', Number(conversa.get('total_mensagens') || 0) + 1)

        // ---------- atribuicao de anuncio (CTWA) ----------
        // guarda na conversa e consolida no lead. So grava quando veio
        // referral, para nao apagar a atribuicao em mensagens seguintes.
        if (anuncio) {
          try {
            if (anuncio.id !== '') conversa.set('anuncio_id', anuncio.id)
            if (anuncio.tipo !== '') conversa.set('anuncio_tipo', anuncio.tipo)
            if (anuncio.url !== '') conversa.set('anuncio_url', anuncio.url)
            if (anuncio.titulo !== '') conversa.set('anuncio_titulo', anuncio.titulo)
            if (anuncio.corpo !== '') conversa.set('anuncio_corpo', anuncio.corpo)
            if (anuncio.ctwa !== '') conversa.set('anuncio_ctwa', anuncio.ctwa)
            if (anuncio.bruto !== '') conversa.set('anuncio_bruto', anuncio.bruto)
            // canal: quem veio de anuncio Meta/Instagram/Facebook e `meta`
            if (
              anuncio.fonte === 'instagram' ||
              anuncio.fonte === 'facebook' ||
              anuncio.fonte === 'ad'
            ) {
              conversa.set('canal', 'meta')
            }
          } catch (eAnC) {}
          if (lead) {
            try {
              var mudouLead = false
              if (anuncio.id !== '') {
                lead.set('anuncio_id', anuncio.id)
                mudouLead = true
              }
              if (anuncio.fonte !== '') {
                lead.set('anuncio_fonte', anuncio.fonte)
                mudouLead = true
              }
              // origem do lead passa a refletir o anuncio
              if (
                anuncio.fonte === 'instagram' ||
                anuncio.fonte === 'facebook' ||
                anuncio.fonte === 'ad'
              ) {
                lead.set('origem', 'meta')
                mudouLead = true
              } else if (anuncio.fonte === 'google') {
                lead.set('origem', 'google')
                mudouLead = true
              }
              if (mudouLead) $app.save(lead)
            } catch (eAnL) {}
          }
        }

        // ---------- pausa da IA por intervenção humana (CA-3-17) ----------
        // Regra: se um HUMANO responde (equipe central pelo celular, ou
        // vendedor), a IA cala naquela conversa. Se quem responde é a própria
        // IA, NÃO pausa — senão ela se desligaria sozinha na primeira resposta
        // (o bug clássico; a RN-63 casa o envio para saber quem falou).
        if (direcao === 'saida' && (autor === 'equipe_central' || autor === 'vendedor')) {
          conversa.set('estado', 'pausada_humano')
          conversa.set(
            'pausada_motivo',
            autor === 'vendedor'
              ? 'vendedor respondeu pelo celular'
              : 'equipe central respondeu pelo celular',
          )
          conversa.set('pausada_em', new Date().toISOString())
        } else if (direcao === 'saida' && autor === 'ia') {
          // resposta da própria IA: mantém como está, nunca pausa
          const est = String(conversa.get('estado') || '')
          if (est === '') conversa.set('estado', 'triagem')
        }
        try {
          $app.save(conversa)
        } catch (eSv) {
          console.log('whatsapp_dapi.js: save falhou -> ' + String(eSv).slice(0, 160))
        }
      } catch (eCv2) {}

      // ---------- leitores (RN-71/RN-87) ----------
      // gestão com escopo "todos" + vendedor dono do número +
      // vendedor responsável pelo lead (na central)
      var leitores = []
      try {
        const colG2 = $app.findCollectionByNameOrId('access_grants')
        const todosG = $app.findRecordsByFilter(colG2, "revoked_at=''", '', 200, 0)
        for (const g of todosG) {
          let acts = []
          let sa = []
          try {
            const rawA = g.get('actions')
            acts =
              Array.isArray(rawA) && rawA.length > 0 && typeof rawA[0] === 'number'
                ? JSON.parse(String.fromCharCode.apply(null, rawA))
                : typeof rawA === 'string'
                  ? JSON.parse(rawA)
                  : rawA || []
          } catch (eA2) {}
          if (acts.indexOf('read_conversas') < 0) continue
          try {
            const rawS = g.get('scope_accounts')
            sa =
              Array.isArray(rawS) && rawS.length > 0 && typeof rawS[0] === 'number'
                ? JSON.parse(String.fromCharCode.apply(null, rawS))
                : typeof rawS === 'string'
                  ? JSON.parse(rawS)
                  : rawS || []
          } catch (eS2) {}
          // escopo VAZIO = só o próprio (deny por padrão); '*' = vê tudo.
          // Antes vazio virava "vê tudo" e o vendedor entrava na conversa da
          // central (falha de privacidade, 28/10).
          const ehTudo = Array.isArray(sa) && sa.indexOf('*') >= 0
          const uid = String(g.get('user_id') || '')
          if (uid === '') continue
          if (ehTudo && leitores.indexOf(uid) < 0) leitores.push(uid)
        }
      } catch (eLt) {}
      // vendedor dono do número
      if (
        papelConexao === 'vendedor' &&
        vendedorDaConexao !== '' &&
        leitores.indexOf(vendedorDaConexao) < 0
      ) {
        leitores.push(vendedorDaConexao)
      }
      // na central: o vendedor responsável pelo lead
      if (papelConexao === 'central' && lead) {
        const ow = String(lead.get('owner_id') || '')
        if (ow !== '' && leitores.indexOf(ow) < 0) leitores.push(ow)
      }

      var sinais = null
      try {
        const ss = $app.findRecordsByFilter(colSin, "conversa='" + conversa.id + "'", '', 1, 0)
        if (ss && ss.length > 0) sinais = ss[0]
      } catch (eSs) {}
      if (!sinais) {
        try {
          const ns = new Record(colSin)
          ns.set('conversa', conversa.id)
          ns.set('conexao', conexao.id)
          ns.set('papel_conexao', papelConexao === 'vendedor' ? 'vendedor' : 'central')
          ns.set('lead', lead ? lead.id : '')
          ns.set('ultima_em', enviadaEm)
          ns.set('contador', 1)
          ns.set('leitores', leitores)
          ns.set('fixture', ehFixture)
          $app.save(ns)
        } catch (eNS) {}
      } else {
        try {
          sinais.set('ultima_em', enviadaEm)
          sinais.set('contador', Number(sinais.get('contador') || 0) + 1)
          sinais.set('leitores', leitores)
          sinais.set('lead', lead ? lead.id : String(sinais.get('lead') || ''))
          $app.save(sinais)
        } catch (eS2) {}
      }
    }
  } catch (eRc) {}

  return e.json(200, {
    ok: true,
    mensagem: msgId,
    lead: lead ? lead.id : '',
    vinculo: lead ? 'ok' : 'sem_telefone',
    autor: autor,
  })
})
