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

  // ---------- 4. eventos que só registram ----------
  if (evento === 'session.created' || evento === 'history_sync') {
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
    const motivoFalha = String(
      (data.error && (data.error.message || data.error.title)) ||
        data.reason ||
        data.message ||
        'falha_nao_informada',
    ).slice(0, 200)
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

  // mensagem entre números da empresa (RN-58)
  if (telefone !== '') {
    try {
      const outras = $app.findRecordsByFilter(colConexoes, "numero='" + telefone + "'", '', 1, 0)
      if (outras && outras.length > 0) {
        return e.json(200, { ok: true, ignorado: 'entre_numeros_da_empresa' })
      }
    } catch (eO) {}
    // linha interna da empresa que NÃO é conexão da D-API (ex.: o 3035-9355 do
    // atendimento). Sem esta checagem, quem manda de dentro da empresa vira
    // lead de cliente — aconteceu em 28/10 com a primeira mensagem real.
    try {
      const colInt = $app.findCollectionByNameOrId('whatsapp_numeros_internos')
      const ints = $app.findRecordsByFilter(colInt, "numero='" + telefone + "'", '', 1, 0)
      if (ints && ints.length > 0) {
        return e.json(200, { ok: true, ignorado: 'numero_interno_da_empresa' })
      }
    } catch (eInt) {}
  }

  // ---------- 8. busca do lead (RN-59) ----------
  const colLeads = $app.findCollectionByNameOrId('crm_leads')
  var lead = null
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

  // ---------- 9. lead não encontrado: cria (RN-61) ----------
  if (!lead && telefone !== '' && !fromMe) {
    const nomeContato = String(lado.name || '').trim()
    const nomeLead =
      nomeContato !== ''
        ? nomeContato.slice(0, 200)
        : 'Contato WhatsApp final ' + telefone.slice(-4)
    try {
      const novo = new Record(colLeads)
      novo.set('nome', nomeLead)
      novo.set('telefone', telefone)
      novo.set('origem', 'whatsapp')
      novo.set('status', 'novo')
      novo.set('conta_id', 'haisan')
      novo.set('fixture', ehFixture)
      novo.set('entrada_whatsapp', conexao.id)
      // número do vendedor → o lead nasce com ele; central → sem responsável
      novo.set('owner_id', papelConexao === 'vendedor' ? vendedorDaConexao : '')
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
      // UNIQUE de telefone: relê e liga (corrida)
      try {
        const rr = $app.findRecordsByFilter(colLeads, "telefone='" + telefone + "'", '', 1, 0)
        if (rr && rr.length > 0) lead = rr[0]
      } catch (eRel) {}
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
      try {
        const achadas = $app.findRecordsByFilter(
          colConv,
          "conexao='" + conexao.id + "' && contato_telefone='" + telefone + "'",
          '',
          1,
          0,
        )
        if (achadas && achadas.length > 0) conversa = achadas[0]
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
        $app.save(conversa)
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
