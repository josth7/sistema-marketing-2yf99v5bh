/// <reference path="../pb_data/types.d.ts" />
/**
 * WhatsApp — responder pelo sistema e observação interna (SPEC-3-005, 30/10).
 *
 * Pedido do dono: o vendedor responde a conversa (texto, foto, áudio, vídeo)
 * DENTRO do sistema, e a gestão deixa uma observação que só o vendedor vê.
 *
 * Rotas (login + `read_conversas`):
 *
 *   GET  /backend/v1/whatsapp/conversas/{id}/mensagens
 *       mensagens da conversa, já filtradas por RN-87.
 *
 *   POST /backend/v1/whatsapp/conversas/{id}/responder
 *       body: { texto?, midia_id?, legenda? }
 *       - valida que o usuário pode ver a conversa (mesma regra da leitura)
 *       - exige que a conversa tenha dono identificável (não responde "no ar")
 *       - põe na fila `whatsapp_envios` com motivo `vendedor_resposta`
 *         (ou `vendedor_midia`) — o cron envia e o webhook marca o autor
 *       - NÃO chama a D-API aqui: a fila já tem retry, 4xx definitivo e log
 *       - pausa a IA da conversa (resposta humana pausa, CA-3-17)
 *
 *   GET  /backend/v1/whatsapp/conversas/{id}/observacoes
 *   POST /backend/v1/whatsapp/conversas/{id}/observacoes
 *       a observação interna: NUNCA vai para o WhatsApp do cliente.
 *       Quem vê: quem escreveu, a gestão (escopo '*') e — se `para_user` está
 *       preenchido — só aquela pessoa; vazio = o vendedor da conversa.
 *
 * Regra de ouro: a observação não pode virar mensagem. Ela mora em
 * `whatsapp_observacoes`, que não tem nenhuma rota de envio apontando para ela.
 *
 * JSVM: lógica INLINE nos callbacks (guard em função top-level não pega).
 */

// ==================== helper compartilhado: quem pode ver a conversa ====================
// (repetido inline em cada callback por causa do JSVM)

routerAdd(
  'GET',
  '/backend/v1/whatsapp/conversas/{id}/mensagens',
  (e) => {
    // ---------- empresa ativa (CA-3-88) ----------
    // Lê os grants AQUI, no escopo da rota: `const meus` de dentro de um try
    // não existe fora dele (lança, o catch engole, o 403 não dispara).
    var empresaAtiva = ''
    try {
      var pedidaW = String(e.request.header.get('X-Empresa') || '')
      var gsW = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      var empGrantW = []
      var ehDonoW = false
      for (const gW of gsW) {
        var empGW = ''
        try {
          empGW = String(gW.get('empresa') || '')
        } catch (eGW) {}
        if (empGW !== '' && empGrantW.indexOf(empGW) < 0) empGrantW.push(empGW)
        var saW = []
        try {
          var rawW = gW.get('scope_accounts')
          saW =
            Array.isArray(rawW) && rawW.length > 0 && typeof rawW[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawW))
              : typeof rawW === 'string'
                ? JSON.parse(rawW)
                : rawW || []
        } catch (eSAW) {}
        if (Array.isArray(saW) && saW.indexOf('*') >= 0) ehDonoW = true
      }
      if (pedidaW !== '') {
        if (!ehDonoW && empGrantW.indexOf(pedidaW) < 0) {
          return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
        }
        empresaAtiva = pedidaW
      } else if (empGrantW.length > 0) {
        empresaAtiva = empGrantW[0]
      } else {
        const esW = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (esW.length > 0) empresaAtiva = esW[0].id
      }
    } catch (eEmpW) {}

    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    function lerLista(raw) {
      let out = []
      try {
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          out = JSON.parse(String.fromCharCode.apply(null, raw))
        } else if (typeof raw === 'string') {
          out = JSON.parse(raw)
        } else {
          out = raw || []
        }
      } catch (err) {}
      return Array.isArray(out) ? out : []
    }

    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      60,
      0,
    )
    var temConversas = false
    var temTudo = false
    var ehGestao = false
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
      if (ate !== '' && ate.slice(0, 10) < hoje) continue
      const acts = lerLista(g.get('actions'))
      if (acts.indexOf('read_conversas') >= 0) temConversas = true
      if (acts.indexOf('read_leads') >= 0) {
        const sa = lerLista(g.get('scope_accounts'))
        if (sa.indexOf('*') >= 0) temTudo = true
      }
      // gestão: quem administra o atendimento enxerga a operação inteira
      if (acts.indexOf('manage_atendimento') >= 0) ehGestao = true
    }
    if (!temConversas) {
      return e.json(403, { ok: false, erro: 'sem permissão para ler conversas (read_conversas)' })
    }

    var conv = null
    try {
      conv = $app.findRecordById('whatsapp_conversas', e.request.pathValue('id'))
    } catch (err) {
      return e.json(404, { ok: false, erro: 'conversa não encontrada' })
    }

    // ---------- RN-87 no servidor ----------
    var conexao = null
    try {
      conexao = $app.findRecordById('whatsapp_conexoes', String(conv.get('conexao')))
    } catch (errCx) {}
    if (!conexao) return e.json(404, { ok: false, erro: 'conexão não encontrada' })

    const papel = String(conexao.get('papel') || '')
    const vendedorDaConexao = String(conexao.get('vendedor_user') || '')
    var lead = null
    try {
      if (String(conv.get('lead') || '') !== '') {
        lead = $app.findRecordById('crm_leads', String(conv.get('lead')))
      }
    } catch (errL) {}

    var pode = false
    if (temTudo || ehGestao) pode = true
    if (papel === 'vendedor' && vendedorDaConexao === e.auth.id) pode = true
    if (
      papel === 'central' &&
      lead &&
      String(lead.get('owner_id') || '') === e.auth.id &&
      String(lead.get('owner_id') || '') !== ''
    ) {
      pode = true
    }
    // leitor explícito do sinal (fixture / caso especial)
    if (!pode) {
      try {
        const colSin = $app.findCollectionByNameOrId('whatsapp_sinais')
        const sin = $app.findRecordsByFilter(colSin, "conversa='" + conv.id + "'", '', 1, 0)
        if (sin && sin.length > 0) {
          const leit = lerLista(sin[0].get('leitores'))
          if (leit.indexOf(e.auth.id) >= 0) {
            // `leitores` não fura a regra do dono (decisão de 09/11)
            var outroDonoR = false
            if (lead) {
              const owR = String(lead.get('owner_id') || '')
              if (owR !== '' && owR !== e.auth.id) outroDonoR = true
            }
            if (!outroDonoR) pode = true
          }
        }
      } catch (errS) {}
    }
    if (!pode) {
      return e.json(403, { ok: false, erro: 'sem permissão para ver esta conversa' })
    }

    // ---------- mensagens ----------
    const colMsg = $app.findCollectionByNameOrId('whatsapp_mensagens')
    var msgs = []
    // 18/11: compara pelos últimos 8 dígitos. A fila grava a saída com o
    // número em outro formato (com/sem 55, com/sem o 9) e a conversa ficava
    // em branco na tela, mesmo com a prévia mostrando a mensagem.
    try {
      const telConv = String(conv.get('contato_telefone') || '')
      const fim8 = telConv.replace(/\D/g, '').slice(-8)
      const filtroTel =
        fim8.length === 8
          ? "contato_telefone~'" + fim8 + "'"
          : "contato_telefone='" + telConv.replace(/'/g, '') + "'"
      msgs = $app.findRecordsByFilter(
        colMsg,
        "conexao='" + String(conv.get('conexao')) + "' && " + filtroTel,
        '-enviada_em',
        300,
        0,
      )
    } catch (errM) {}

    const itens = []
    for (const m of msgs) {
      const apagada = String(m.get('apagada_em') || '') !== ''
      itens.push({
        id: m.id,
        autor: m.get('autor'),
        autor_user: String(m.get('autor_user') || ''),
        direcao: m.get('direcao'),
        tipo: m.get('tipo'),
        texto: apagada ? '' : String(m.get('texto') || ''),
        media_url: apagada ? '' : String(m.get('media_url') || ''),
        media_url_temporaria: String(m.get('media_url_temporaria')) === 'true',
        media_mimetype: m.get('media_mimetype'),
        media_duracao_s: m.get('media_duracao_s'),
        media_ptt: String(m.get('media_ptt')) === 'true',
        status: m.get('status'),
        enviada_em: String(m.get('enviada_em') || ''),
        editada_em: String(m.get('editada_em') || ''),
        apagada: apagada,
      })
    }
    itens.sort(function (a, b) {
      return String(a.enviada_em) < String(b.enviada_em) ? -1 : 1
    })

    return e.json(200, {
      ok: true,
      conversa: conv.id,
      contato_nome: String(conv.get('contato_nome') || ''),
      contato_telefone: String(conv.get('contato_telefone') || ''),
      lead: String(conv.get('lead') || ''),
      estado: String(conv.get('estado') || ''),
      total: itens.length,
      itens: itens,
    })
  },
  $apis.requireAuth(),
)

// ==================== responder ====================

routerAdd(
  'POST',
  '/backend/v1/whatsapp/conversas/{id}/responder',
  (e) => {
    // ---------- empresa ativa (CA-3-88) ----------
    // Lê os grants AQUI, no escopo da rota: `const meus` de dentro de um try
    // não existe fora dele (lança, o catch engole, o 403 não dispara).
    var empresaAtiva = ''
    try {
      var pedidaW = String(e.request.header.get('X-Empresa') || '')
      var gsW = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      var empGrantW = []
      var ehDonoW = false
      for (const gW of gsW) {
        var empGW = ''
        try {
          empGW = String(gW.get('empresa') || '')
        } catch (eGW) {}
        if (empGW !== '' && empGrantW.indexOf(empGW) < 0) empGrantW.push(empGW)
        var saW = []
        try {
          var rawW = gW.get('scope_accounts')
          saW =
            Array.isArray(rawW) && rawW.length > 0 && typeof rawW[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawW))
              : typeof rawW === 'string'
                ? JSON.parse(rawW)
                : rawW || []
        } catch (eSAW) {}
        if (Array.isArray(saW) && saW.indexOf('*') >= 0) ehDonoW = true
      }
      if (pedidaW !== '') {
        if (!ehDonoW && empGrantW.indexOf(pedidaW) < 0) {
          return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
        }
        empresaAtiva = pedidaW
      } else if (empGrantW.length > 0) {
        empresaAtiva = empGrantW[0]
      } else {
        const esW = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (esW.length > 0) empresaAtiva = esW[0].id
      }
    } catch (eEmpW) {}

    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    function lerLista(raw) {
      let out = []
      try {
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          out = JSON.parse(String.fromCharCode.apply(null, raw))
        } else if (typeof raw === 'string') {
          out = JSON.parse(raw)
        } else {
          out = raw || []
        }
      } catch (err) {}
      return Array.isArray(out) ? out : []
    }

    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      60,
      0,
    )
    var temConversas = false
    var podeResponder = false
    var temTudo = false
    var ehGestao = false
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
      if (ate !== '' && ate.slice(0, 10) < hoje) continue
      const acts = lerLista(g.get('actions'))
      if (acts.indexOf('read_conversas') >= 0) temConversas = true
      // CA-3-50 (06/11): responder é ação própria. Quem só lê VÊ a conversa,
      // mas não envia. A gestão libera em Administração.
      if (acts.indexOf('reply_conversas') >= 0) podeResponder = true
      if (acts.indexOf('read_leads') >= 0) {
        const sa = lerLista(g.get('scope_accounts'))
        if (sa.indexOf('*') >= 0) temTudo = true
      }
      if (acts.indexOf('manage_atendimento') >= 0) ehGestao = true
    }
    if (!temConversas) {
      return e.json(403, { ok: false, erro: 'sem permissão para ver conversas (read_conversas)' })
    }
    if (!podeResponder) {
      return e.json(403, {
        ok: false,
        erro: 'sem permissão para responder pelo sistema (reply_conversas)',
        detalhe: 'peça à gestão para liberar em Administração',
      })
    }

    var conv = null
    try {
      conv = $app.findRecordById('whatsapp_conversas', e.request.pathValue('id'))
    } catch (err) {
      return e.json(404, { ok: false, erro: 'conversa não encontrada' })
    }

    var conexao = null
    try {
      conexao = $app.findRecordById('whatsapp_conexoes', String(conv.get('conexao')))
    } catch (errCx) {}
    if (!conexao) return e.json(404, { ok: false, erro: 'conexão não encontrada' })
    if (String(conexao.get('ativo')) !== 'true') {
      return e.json(409, { ok: false, erro: 'número inativo — não dá para enviar por ele' })
    }

    const papel = String(conexao.get('papel') || '')
    const vendedorDaConexao = String(conexao.get('vendedor_user') || '')
    var lead = null
    try {
      if (String(conv.get('lead') || '') !== '') {
        lead = $app.findRecordById('crm_leads', String(conv.get('lead')))
      }
    } catch (errL) {}

    // ---------- mesma regra de acesso da leitura ----------
    var pode = false
    var ehDonoDaConversa = false
    if (temTudo || ehGestao) pode = true
    // REGRA DO DONO (decisão do dono, 09/11): responde quem é dono do LEAD, em
    // qualquer número. Ser dono do número NÃO basta — o cliente da Adriana que
    // falou no número do Fábio continua sendo da Adriana.
    if (
      lead &&
      String(lead.get('owner_id') || '') === e.auth.id &&
      String(lead.get('owner_id') || '') !== ''
    ) {
      pode = true
      ehDonoDaConversa = true
    }
    // conversa SEM lead no próprio número: pode responder
    if (!pode && !lead && papel === 'vendedor' && vendedorDaConexao === e.auth.id) {
      pode = true
      ehDonoDaConversa = true
    }
    if (!pode) {
      try {
        const colSin = $app.findCollectionByNameOrId('whatsapp_sinais')
        const sin = $app.findRecordsByFilter(colSin, "conversa='" + conv.id + "'", '', 1, 0)
        if (sin && sin.length > 0) {
          const leit = lerLista(sin[0].get('leitores'))
          if (leit.indexOf(e.auth.id) >= 0) pode = true
        }
      } catch (errS) {}
    }
    if (!pode) {
      return e.json(403, { ok: false, erro: 'sem permissão para responder nesta conversa' })
    }

    // ---------- entrada ----------
    const body = e.requestInfo().body || {}
    const texto = String(body.texto || '').slice(0, 4000)
    const midiaId = String(body.midia_id || '').slice(0, 15)
    const legenda = String(body.legenda || '').slice(0, 1000)
    if (texto.trim() === '' && midiaId === '') {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { texto: 'escreva uma mensagem ou anexe um arquivo' },
      })
    }

    const destino = String(conv.get('contato_telefone') || '').replace(/[^0-9]/g, '')
    if (destino.length < 10) {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { contato: 'conversa sem telefone válido' },
      })
    }

    // ---------- mídia (se houver) ----------
    var midia = null
    if (midiaId !== '') {
      try {
        midia = $app.findRecordById('whatsapp_midia', midiaId)
      } catch (errMid) {}
      if (!midia) {
        return e.json(404, { ok: false, erro: 'arquivo não encontrado' })
      }
      // quem enviou o arquivo ou a gestão
      const donoMidia = String(midia.get('enviado_por') || '')
      if (donoMidia !== e.auth.id && !temTudo && !ehGestao) {
        return e.json(403, { ok: false, erro: 'este arquivo não é seu' })
      }
    }

    // ---------- fila ----------
    const colEnv = $app.findCollectionByNameOrId('whatsapp_envios')
    const env = new Record(colEnv)
    env.set('lead', String(conv.get('lead') || ''))
    env.set('conexao', conexao.id)
    env.set('destino_telefone', destino)
    env.set('motivo', midia ? 'vendedor_midia' : 'vendedor_resposta')
    env.set('modo', 'texto')
    env.set('texto', texto)
    env.set('legenda', legenda)
    env.set('autor_user', e.auth.id)
    env.set('criado_por', e.auth.id)
    env.set('estado', 'pendente')
    env.set('tentativas', 0)
    if (midia) env.set('midia', midia.id)
    env.set('fixture', String(conexao.get('fixture')) === 'true')
    // dedupe_key tem UNIQUE: sem valor, o SEGUNDO envio colide com o primeiro
    // (vazio == vazio) e a resposta morre com "Value must be unique" — provado
    // em 30/10. Cada resposta do vendedor é intencional: chave única por envio.
    env.set('dedupe_key', 'vresp-' + conv.id + '-' + new Date().getTime())
    try {
      $app.save(env)
    } catch (errEnv) {
      return e.json(500, {
        ok: false,
        erro: 'falha ao enfileirar: ' + String(errEnv).slice(0, 150),
      })
    }

    // ---------- pausa a IA (resposta humana pausa — CA-3-17) ----------
    try {
      if (String(conv.get('estado')) !== 'pausada_humano') {
        conv.set('estado', 'pausada_humano')
        conv.set('pausada_motivo', 'resposta_pelo_sistema')
        conv.set('pausada_em', new Date().toISOString())
        $app.save(conv)
      }
    } catch (errP) {}

    // ---------- avisa a tela (tempo real) ----------
    try {
      const colSin = $app.findCollectionByNameOrId('whatsapp_sinais')
      const sin = $app.findRecordsByFilter(colSin, "conversa='" + conv.id + "'", '', 1, 0)
      if (sin && sin.length > 0) {
        const s = sin[0]
        s.set('contador', Number(s.get('contador') || 0) + 1)
        s.set('ultima_em', new Date().toISOString())
        $app.save(s)
      }
    } catch (errSin) {}

    return e.json(200, {
      ok: true,
      envio: env.id,
      fila: true,
      motivo: midia ? 'vendedor_midia' : 'vendedor_resposta',
      detalhe: 'a mensagem sai em até 1 minuto pela fila',
    })
  },
  $apis.requireAuth(),
)

// ==================== observações internas ====================

routerAdd(
  'GET',
  '/backend/v1/whatsapp/conversas/{id}/observacoes',
  (e) => {
    // ---------- empresa ativa (CA-3-88) ----------
    // Lê os grants AQUI, no escopo da rota: `const meus` de dentro de um try
    // não existe fora dele (lança, o catch engole, o 403 não dispara).
    var empresaAtiva = ''
    try {
      var pedidaW = String(e.request.header.get('X-Empresa') || '')
      var gsW = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      var empGrantW = []
      var ehDonoW = false
      for (const gW of gsW) {
        var empGW = ''
        try {
          empGW = String(gW.get('empresa') || '')
        } catch (eGW) {}
        if (empGW !== '' && empGrantW.indexOf(empGW) < 0) empGrantW.push(empGW)
        var saW = []
        try {
          var rawW = gW.get('scope_accounts')
          saW =
            Array.isArray(rawW) && rawW.length > 0 && typeof rawW[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawW))
              : typeof rawW === 'string'
                ? JSON.parse(rawW)
                : rawW || []
        } catch (eSAW) {}
        if (Array.isArray(saW) && saW.indexOf('*') >= 0) ehDonoW = true
      }
      if (pedidaW !== '') {
        if (!ehDonoW && empGrantW.indexOf(pedidaW) < 0) {
          return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
        }
        empresaAtiva = pedidaW
      } else if (empGrantW.length > 0) {
        empresaAtiva = empGrantW[0]
      } else {
        const esW = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (esW.length > 0) empresaAtiva = esW[0].id
      }
    } catch (eEmpW) {}

    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    function lerLista(raw) {
      let out = []
      try {
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          out = JSON.parse(String.fromCharCode.apply(null, raw))
        } else if (typeof raw === 'string') {
          out = JSON.parse(raw)
        } else {
          out = raw || []
        }
      } catch (err) {}
      return Array.isArray(out) ? out : []
    }

    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      60,
      0,
    )
    var temTudo = false
    var ehGestao = false
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
      if (ate !== '' && ate.slice(0, 10) < hoje) continue
      const acts = lerLista(g.get('actions'))
      if (acts.indexOf('read_leads') >= 0) {
        const sa = lerLista(g.get('scope_accounts'))
        if (sa.indexOf('*') >= 0) temTudo = true
      }
      if (acts.indexOf('manage_atendimento') >= 0) ehGestao = true
    }

    var conv = null
    try {
      conv = $app.findRecordById('whatsapp_conversas', e.request.pathValue('id'))
    } catch (err) {
      return e.json(404, { ok: false, erro: 'conversa não encontrada' })
    }

    // o vendedor da conversa precisa poder ler a observação dele
    var conexao = null
    try {
      conexao = $app.findRecordById('whatsapp_conexoes', String(conv.get('conexao')))
    } catch (errCx) {}
    const vendedorDaConexao = conexao ? String(conexao.get('vendedor_user') || '') : ''
    var lead = null
    try {
      if (String(conv.get('lead') || '') !== '') {
        lead = $app.findRecordById('crm_leads', String(conv.get('lead')))
      }
    } catch (errL) {}
    const souVendedorDaConversa =
      vendedorDaConexao === e.auth.id || (lead && String(lead.get('owner_id') || '') === e.auth.id)

    if (!temTudo && !ehGestao && !souVendedorDaConversa) {
      return e.json(403, { ok: false, erro: 'sem permissão para ver observações desta conversa' })
    }

    const colObs = $app.findCollectionByNameOrId('whatsapp_observacoes')
    var obs = []
    try {
      obs = $app.findRecordsByFilter(colObs, "conversa='" + conv.id + "'", '-created', 100, 0)
    } catch (errO) {}

    const itens = []
    for (const o of obs) {
      const para = String(o.get('para_user') || '')
      const autor = String(o.get('autor_user') || '')
      // regra: gestão vê tudo; quem escreveu vê; `para_user` vazio = o vendedor
      // da conversa vê; `para_user` preenchido = só aquela pessoa.
      var visivel = false
      if (temTudo || ehGestao) visivel = true
      if (autor === e.auth.id) visivel = true
      if (para === '') {
        if (souVendedorDaConversa) visivel = true
      } else if (para === e.auth.id) {
        visivel = true
      }
      if (!visivel) continue
      itens.push({
        id: o.id,
        texto: String(o.get('texto') || ''),
        autor_nome: String(o.get('autor_nome') || ''),
        autor_user: autor,
        para_user: para,
        lida_em: String(o.get('lida_em') || ''),
        created: String(o.get('created') || ''),
      })
    }
    itens.sort(function (a, b) {
      return String(a.created) > String(b.created) ? -1 : 1
    })

    return e.json(200, {
      ok: true,
      conversa: conv.id,
      total: itens.length,
      posso_escrever: temTudo || ehGestao || souVendedorDaConversa,
      itens: itens,
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/whatsapp/conversas/{id}/observacoes',
  (e) => {
    // ---------- empresa ativa (CA-3-88) ----------
    // Lê os grants AQUI, no escopo da rota: `const meus` de dentro de um try
    // não existe fora dele (lança, o catch engole, o 403 não dispara).
    var empresaAtiva = ''
    try {
      var pedidaW = String(e.request.header.get('X-Empresa') || '')
      var gsW = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      var empGrantW = []
      var ehDonoW = false
      for (const gW of gsW) {
        var empGW = ''
        try {
          empGW = String(gW.get('empresa') || '')
        } catch (eGW) {}
        if (empGW !== '' && empGrantW.indexOf(empGW) < 0) empGrantW.push(empGW)
        var saW = []
        try {
          var rawW = gW.get('scope_accounts')
          saW =
            Array.isArray(rawW) && rawW.length > 0 && typeof rawW[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawW))
              : typeof rawW === 'string'
                ? JSON.parse(rawW)
                : rawW || []
        } catch (eSAW) {}
        if (Array.isArray(saW) && saW.indexOf('*') >= 0) ehDonoW = true
      }
      if (pedidaW !== '') {
        if (!ehDonoW && empGrantW.indexOf(pedidaW) < 0) {
          return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
        }
        empresaAtiva = pedidaW
      } else if (empGrantW.length > 0) {
        empresaAtiva = empGrantW[0]
      } else {
        const esW = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (esW.length > 0) empresaAtiva = esW[0].id
      }
    } catch (eEmpW) {}

    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    function lerLista(raw) {
      let out = []
      try {
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          out = JSON.parse(String.fromCharCode.apply(null, raw))
        } else if (typeof raw === 'string') {
          out = JSON.parse(raw)
        } else {
          out = raw || []
        }
      } catch (err) {}
      return Array.isArray(out) ? out : []
    }

    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      60,
      0,
    )
    var temTudo = false
    var ehGestao = false
    var temConversas = false
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
      if (ate !== '' && ate.slice(0, 10) < hoje) continue
      const acts = lerLista(g.get('actions'))
      if (acts.indexOf('read_conversas') >= 0) temConversas = true
      if (acts.indexOf('read_leads') >= 0) {
        const sa = lerLista(g.get('scope_accounts'))
        if (sa.indexOf('*') >= 0) temTudo = true
      }
      if (acts.indexOf('manage_atendimento') >= 0) ehGestao = true
    }
    if (!temConversas && !ehGestao && !temTudo) {
      return e.json(403, { ok: false, erro: 'sem permissão para comentar (read_conversas)' })
    }

    var conv = null
    try {
      conv = $app.findRecordById('whatsapp_conversas', e.request.pathValue('id'))
    } catch (err) {
      return e.json(404, { ok: false, erro: 'conversa não encontrada' })
    }

    var conexao = null
    try {
      conexao = $app.findRecordById('whatsapp_conexoes', String(conv.get('conexao')))
    } catch (errCx) {}
    const vendedorDaConexao = conexao ? String(conexao.get('vendedor_user') || '') : ''
    var lead = null
    try {
      if (String(conv.get('lead') || '') !== '') {
        lead = $app.findRecordById('crm_leads', String(conv.get('lead')))
      }
    } catch (errL) {}
    const souVendedorDaConversa =
      vendedorDaConexao === e.auth.id || (lead && String(lead.get('owner_id') || '') === e.auth.id)

    if (!temTudo && !ehGestao && !souVendedorDaConversa) {
      return e.json(403, { ok: false, erro: 'sem permissão para comentar nesta conversa' })
    }

    const body = e.requestInfo().body || {}
    const texto = String(body.texto || '').slice(0, 2000)
    if (texto.trim() === '') {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { texto: 'escreva a observação' },
      })
    }
    // destino da observação: vazio = o vendedor da conversa
    var paraUser = String(body.para_user || '').slice(0, 15)
    if (paraUser === '' && !souVendedorDaConversa && vendedorDaConexao !== '') {
      paraUser = vendedorDaConexao
    }

    var nomeAutor = ''
    try {
      nomeAutor = String($app.findRecordById('users', e.auth.id).get('name') || '')
    } catch (errU) {}

    const colObs = $app.findCollectionByNameOrId('whatsapp_observacoes')
    const o = new Record(colObs)
    o.set('conversa', conv.id)
    o.set('lead', String(conv.get('lead') || ''))
    o.set('conexao', String(conv.get('conexao') || ''))
    o.set('texto', texto)
    o.set('autor_user', e.auth.id)
    o.set('autor_nome', nomeAutor)
    o.set('para_user', paraUser)
    try {
      $app.save(o)
    } catch (errO) {
      return e.json(500, { ok: false, erro: 'falha ao salvar observação' })
    }

    return e.json(200, {
      ok: true,
      id: o.id,
      interna: true,
      detalhe: 'observação interna — não é enviada ao cliente',
    })
  },
  $apis.requireAuth(),
)
