/// <reference path="../pb_data/types.d.ts" />
/**
 * CONVERSAS ESPERANDO — POR CLIENTE, NÃO POR CONVERSA (09/11).
 *
 * **O problema que isto resolve (relato do dono):**
 * o cliente fala com a central, o vendedor chama ele pelo número dele, e a
 * conversa da central fica "sem resposta para sempre" — porque a última
 * mensagem *daquela conversa* continua sendo do cliente, mesmo que ele já
 * tenha sido atendido por outro número da Haisan.
 *
 * **A regra nova:** o cliente só está esperando se a última mensagem **com
 * ele**, somando TODOS os números da Haisan (central e vendedores), for dele.
 *
 * **Fora da conta:** conversa interna (equipe) e conversa marcada como
 * "não é cliente".
 *
 * **Quem vê o quê:**
 *   - **gestão** (escopo `*`): todos os clientes;
 *   - **vendedor**: só os clientes dos leads **dele** — não recusa mais.
 *
 * Rotas:
 *   GET /backend/v1/gestao/esperando      → lista por cliente
 *   GET /backend/v1/gestao/esperando/resumo → só as contagens (para o resumo)
 *
 * A MESMA função monta as duas: se mudar a regra, muda nos dois lugares.
 */
routerAdd(
  'GET',
  '/backend/v1/gestao/esperando',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    function lerL(raw) {
      try {
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          return JSON.parse(String.fromCharCode.apply(null, raw))
        }
        if (typeof raw === 'string') return JSON.parse(raw)
        return raw || []
      } catch (err) {
        return []
      }
    }

    const app = $app
    const hoje = new Date().toISOString().slice(0, 10)

    // ---------- quem é esta pessoa: gestão ou vendedor ----------
    var ehGestao = false
    var temLeitura = false
    try {
      const meus = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      for (const g of meus) {
        const de = String(g.get('valid_from') || '')
        const ate = String(g.get('valid_until') || '')
        if (de !== '' && de.slice(0, 10) > hoje) continue
        if (ate !== '' && ate.slice(0, 10) < hoje) continue
        const atos = lerL(g.get('actions'))
        const esc = lerL(g.get('scope_accounts'))
        if (Array.isArray(esc) && esc.indexOf('*') >= 0) ehGestao = true
        if (
          Array.isArray(atos) &&
          (atos.indexOf('read_conversas') >= 0 || atos.indexOf('read_leads') >= 0)
        ) {
          temLeitura = true
        }
      }
    } catch (e0) {}
    // vendedor tem leitura; quem não tem nada, não entra
    if (!ehGestao && !temLeitura) return e.json(404, { ok: false, erro: 'não encontrado' })

    // ---------- empresa ativa (CA-3-88) ----------
    // BUG CORRIGIDO (10/11): antes eu usava `meus`, que é `const` DENTRO de um
    // bloco try — fora dele não existe e o acesso lança ReferenceError, que o
    // catch engolia. Resultado: ehDonoE ficava false e o 403 nunca disparava.
    // Agora os grants são lidos aqui, no escopo desta rota.
    var empresaAtiva = ''
    try {
      var pedidaE = String(e.request.header.get('X-Empresa') || '')
      var gsE = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      var empGrant = []
      var ehDonoE = false
      for (const gE5 of gsE) {
        var empG5 = ''
        try {
          empG5 = String(gE5.get('empresa') || '')
        } catch (eG5) {}
        if (empG5 !== '' && empGrant.indexOf(empG5) < 0) empGrant.push(empG5)
        var saE5 = []
        try {
          var rawE5 = gE5.get('scope_accounts')
          saE5 =
            Array.isArray(rawE5) && rawE5.length > 0 && typeof rawE5[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawE5))
              : typeof rawE5 === 'string'
                ? JSON.parse(rawE5)
                : rawE5 || []
        } catch (eSA5) {}
        if (Array.isArray(saE5) && saE5.indexOf('*') >= 0) ehDonoE = true
      }
      if (pedidaE !== '') {
        if (!ehDonoE && empGrant.indexOf(pedidaE) < 0) {
          return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
        }
        empresaAtiva = pedidaE
      } else if (empGrant.length > 0) {
        empresaAtiva = empGrant[0]
      } else {
        const esE5 = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (esE5.length > 0) empresaAtiva = esE5[0].id
      }
    } catch (eEmpE5) {}

    const out = {
      ok: true,
      total: 0,
      por_vendedor: {},
      por_numero: {},
      mais_antiga_horas: 0,
      faixas: { ate_1h: 0, ate_24h: 0, ate_7d: 0, mais_7d: 0 },
      itens: [],
      escopo: ehGestao ? 'gestao' : 'vendedor',
    }

    // ---------- nomes ----------
    const nomes = {}
    try {
      for (const u of app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        '',
        '',
        300,
        0,
      )) {
        nomes[u.id] = String(u.get('name') || u.get('email') || '')
      }
    } catch (e1) {}

    const nomesCx = {}
    try {
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        '',
        '',
        50,
        0,
      )) {
        nomesCx[c.id] = String(c.get('nome_exibicao') || c.get('papel') || '')
      }
    } catch (e2) {}

    // ---------- leads (dono, nome, fixture) ----------
    const leadInfo = {}
    try {
      for (const l of app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        'fixture=false' + (empresaAtiva !== '' ? " && empresa='" + empresaAtiva + "'" : ''),
        '',
        12000,
        0,
      )) {
        leadInfo[l.id] = {
          dono: String(l.get('owner_id') || ''),
          nome: String(l.get('nome') || ''),
          telefone: String(l.get('telefone') || '').replace(/\D/g, ''),
        }
      }
    } catch (e3) {}

    // ---------- conversas (sem interna e sem "não é cliente") ----------
    var convs = []
    try {
      convs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        'fixture=false' + (empresaAtiva !== '' ? " && empresa='" + empresaAtiva + "'" : ''),
        '',
        8000,
        0,
      )
    } catch (e4) {
      out.ok = false
      out.erro = String(e4).slice(0, 140)
      return e.json(200, out)
    }

    // ---------- AGRUPA POR CLIENTE ----------
    // telefone normalizado (sem 55 e sem o 9) para o mesmo cliente valer uma vez
    function chaveCliente(tel) {
      var d = String(tel || '').replace(/\D/g, '')
      if (d.indexOf('55') === 0 && d.length > 11) d = d.slice(2)
      // remove o 9 depois do DDD quando sobra 9 dígitos
      if (d.length === 11 && d.charAt(2) === '9') d = d.slice(0, 2) + d.slice(3)
      return d
    }

    const porCliente = {}
    for (const cv of convs) {
      // fora: conversa interna da equipe
      if (String(cv.get('interna')) === 'true') continue
      // fora: marcada como "não é cliente"
      if (String(cv.get('nao_cliente')) === 'true') continue

      const tel = String(cv.get('contato_telefone') || '').replace(/\D/g, '')
      if (tel === '') continue
      const chave = chaveCliente(tel)
      if (chave === '') continue

      const quando = new Date(String(cv.get('ultima_mensagem_em') || '')).getTime()
      const grupo = porCliente[chave]
      if (!grupo) {
        porCliente[chave] = {
          telefone: tel,
          mensagens: [cv],
          ultimaQ: quando,
          ultimaCv: cv,
        }
      } else {
        grupo.mensagens.push(cv)
        // guarda a conversa com a mensagem MAIS RECENTE do cliente
        if (quando > grupo.ultimaQ) {
          grupo.ultimaQ = quando
          grupo.ultimaCv = cv
        }
      }
    }

    // ---------- decide quem está esperando ----------
    const agoraMs = new Date().getTime()
    // ---------- CA-3-113 (10/11): mensagem de ENCERRAMENTO ----------
    // Agradecimento, figurinha, reação ou emoji sozinho NÃO pedem resposta.
    // Foto, áudio, documento e qualquer texto com pedido continuam contando.
    function ehEncerramento(previa, tipo) {
      const t = String(previa || '').trim()
      const tp = String(tipo || '').toLowerCase()
      // mídia que pede resposta
      if (tp === 'image' || tp === 'audio' || tp === 'document' || tp === 'video') return false
      if (t.indexOf('[foto]') >= 0 || t.indexOf('[áudio]') >= 0 || t.indexOf('[audio]') >= 0)
        return false
      if (t.indexOf('[documento]') >= 0) return false
      // figurinha e reação nunca pedem
      if (tp === 'sticker' || tp === 'reaction') return true
      if (t === '') return false
      // só emoji / símbolo
      const semEmoji = t.replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}\u{200D}\s]/gu, '')
      if (semEmoji === '') return true
      // texto com pergunta pede resposta
      if (t.indexOf('?') >= 0) return false
      // pedido explícito pede resposta
      const pedidos = [
        'preco',
        'preço',
        'valor',
        'quanto',
        'frete',
        'prazo',
        'medida',
        'foto',
        'catalogo',
        'catálogo',
        'pode',
        'quero',
        'tem',
        'qual',
        'quando',
        'como',
        'onde',
      ]
      const low = t.toLowerCase()
      for (const p of pedidos) if (low.indexOf(p) >= 0) return false
      // agradecimento/confirmação com até 6 palavras
      const thanks = [
        'obrigado',
        'obrigada',
        'obg',
        'brigado',
        'agradeço',
        'agradeco',
        'valeu',
        'vlw',
        'ok',
        'okay',
        'blz',
        'beleza',
        'certo',
        'combinado',
        'show',
        'top',
        'perfeito',
        'ótimo',
        'otimo',
      ]
      var temThanks = false
      for (const th of thanks) if (low.indexOf(th) >= 0) temThanks = true
      if (!temThanks) return false
      const palavras = t.split(/\s+/).filter(function (x) {
        return x !== ''
      })
      if (palavras.length > 6) return false
      return true
    }

    for (const chave in porCliente) {
      const g = porCliente[chave]
      // olha TODAS as conversas do cliente: basta UMA ter a última mensagem
      // nossa depois da última dele para ele NÃO estar esperando
      var ultimaDoCliente = 0
      var ultimaNossa = 0
      var cvRecente = g.ultimaCv
      var leadDoCliente = ''
      var numeroDoCliente = ''
      for (const cv of g.mensagens) {
        const q = new Date(String(cv.get('ultima_mensagem_em') || '')).getTime()
        const autor = String(cv.get('ultimo_autor') || '')
        if (q > 0) {
          if (autor === 'cliente') {
            if (q > ultimaDoCliente) {
              ultimaDoCliente = q
              cvRecente = cv
            }
          } else {
            if (q > ultimaNossa) ultimaNossa = q
          }
        }
        const lid = String(cv.get('lead') || '')
        if (lid !== '' && leadDoCliente === '') leadDoCliente = lid
      }
      // já marcado como Resolvida? só volta se ele mandou algo novo depois
      var resolvidaEm = 0
      for (const cv of g.mensagens) {
        const rq = new Date(String(cv.get('resolvida_em') || '')).getTime()
        if (rq > resolvidaEm) resolvidaEm = rq
      }
      if (resolvidaEm > 0 && ultimaDoCliente <= resolvidaEm) continue

      // encerramento (agradecimento, figurinha, emoji) não conta como esperando
      if (
        ehEncerramento(
          String(cvRecente.get('ultima_previa') || ''),
          String(cvRecente.get('ultimo_tipo') || ''),
        )
      ) {
        continue
      }

      // REGRA: esperando = a última mensagem DELE é mais nova que a última nossa
      if (!(ultimaDoCliente > 0 && ultimaDoCliente > ultimaNossa)) continue

      const info = leadDoCliente !== '' ? leadInfo[leadDoCliente] : null
      const dono = info ? info.dono : ''

      // ESCOPO: vendedor só vê os clientes dos leads dele
      if (!ehGestao && dono !== e.auth.id) continue

      const vend = dono !== '' ? nomes[dono] || '(?)' : 'SEM DONO'
      numeroDoCliente = nomesCx[String(cvRecente.get('conexao') || '')] || '(?)'
      const horas = Math.round((agoraMs - ultimaDoCliente) / 3600000)

      out.por_vendedor[vend] = (out.por_vendedor[vend] || 0) + 1
      out.por_numero[numeroDoCliente] = (out.por_numero[numeroDoCliente] || 0) + 1
      if (horas > out.mais_antiga_horas) out.mais_antiga_horas = horas

      if (horas < 0) out.faixas.mais_7d++
      else if (horas <= 1) out.faixas.ate_1h++
      else if (horas <= 24) out.faixas.ate_24h++
      else if (horas <= 168) out.faixas.ate_7d++
      else out.faixas.mais_7d++

      out.total++
      if (out.itens.length < 400) {
        out.itens.push({
          id: cvRecente.id,
          nome: info && info.nome !== '' ? info.nome : String(cvRecente.get('contato_nome') || ''),
          telefone: g.telefone,
          vendedor: vend,
          dono_id: dono,
          lead: leadDoCliente,
          numero: numeroDoCliente,
          horas: horas,
          previa: String(cvRecente.get('ultima_previa') || '').slice(0, 60),
          conversas: g.mensagens.length,
        })
      }
    }

    out.itens.sort(function (a, b) {
      return b.horas - a.horas
    })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)

// ==================== MARCAR RESOLVIDA (CA-3-113) ====================
routerAdd(
  'POST',
  '/backend/v1/gestao/esperando/resolver',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}
    const convId = String(body.conversa || '')
    if (convId === '') return e.json(422, { ok: false, erro: 'informe a conversa' })

    var cv = null
    try {
      cv = $app.findRecordById('whatsapp_conversas', convId)
    } catch (e1) {
      return e.json(404, { ok: false, erro: 'conversa não encontrada' })
    }

    try {
      cv.set('resolvida_em', new Date().toISOString())
      cv.set('resolvida_por', e.auth.id)
      $app.save(cv)
    } catch (e2) {
      return e.json(500, { ok: false, erro: 'não consegui marcar: ' + String(e2).slice(0, 120) })
    }

    // trilha do lead
    try {
      const lid = String(cv.get('lead') || '')
      if (lid !== '') {
        const ev = new Record($app.findCollectionByNameOrId('crm_lead_events'))
        ev.set('lead_id', lid)
        ev.set('tipo', 'nota')
        ev.set('texto', 'Cliente marcado como Resolvida na lista de esperando')
        ev.set('user_id', e.auth.id)
        ev.set('fixture', false)
        $app.save(ev)
      }
    } catch (e3) {}

    return e.json(200, { ok: true, conversa: convId })
  },
  $apis.requireAuth(),
)
