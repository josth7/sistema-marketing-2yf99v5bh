/// <reference path="../pb_data/types.d.ts" />
/**
 * WhatsApp — conversa na ficha do lead e lista de conversas (SPEC-3-005, CA-3-15).
 *
 * Rotas (login + ação `read_conversas`):
 *   GET /backend/v1/whatsapp/leads/{id}/conversa?antes=<data>&limite=100
 *       mensagens das conversas daquele lead em que o usuário está em `leitores`
 *   GET /backend/v1/whatsapp/conversas?conexao=<id|todos>&antes=<data>&limite=50
 *       lista de conversas visíveis, da mais recente para a mais antiga
 *
 * Acesso por número (RN-71):
 *   - gestão: grant de leads com escopo "todos" ('*' ou vazio) vê os cinco números
 *   - vendedor: vê o número ligado ao perfil dele; na central, só os leads com owner = ele
 *   - `read_leads` sozinho NÃO abre conversa — exige `read_conversas`
 *   - cada abertura grava em access_audit
 *
 * A mensagem apagada não devolve texto nem link. Texto é devolvido como texto
 * (nunca HTML), então `<img onerror>` aparece literal na tela.
 *
 * JSVM: lógica INLINE nos callbacks.
 */

routerAdd(
  'GET',
  '/backend/v1/whatsapp/leads/{id}/conversa',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      60,
      0,
    )

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
      } catch (e) {}
      return Array.isArray(out) ? out : []
    }

    var temConversas = false
    var temTudoLeads = false
    var temReadLeads = false
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
      if (ate !== '' && ate.slice(0, 10) < hoje) continue
      const acts = lerLista(g.get('actions'))
      if (acts.indexOf('read_conversas') >= 0) temConversas = true
      if (acts.indexOf('read_leads') >= 0) {
        temReadLeads = true
        const sa = lerLista(g.get('scope_accounts'))
        // escopo VAZIO = só os leads do próprio (deny por padrão); '*' = tudo.
        // Antes vazio virava "tudo" e o vendedor via a conversa da central.
        if (sa.indexOf('*') >= 0) temTudoLeads = true
      }
    }
    if (!temConversas) {
      return e.json(403, { ok: false, erro: 'sem permissão para ler conversas (read_conversas)' })
    }

    let lead
    try {
      lead = $app.findRecordById('crm_leads', e.request.pathValue('id'))
    } catch (_) {
      return e.json(404, { ok: false, erro: 'lead não encontrado' })
    }
    var emailAuth = ''
    try {
      emailAuth = String($app.findRecordById('users', e.auth.id).get('email') || '')
    } catch (eEm) {}
    const ehFixture = emailAuth.toLowerCase().indexOf('fixture') >= 0
    if (String(lead.get('fixture')) !== String(ehFixture)) {
      return e.json(404, { ok: false, erro: 'lead não encontrado' })
    }

    // ---------- quais conversas deste lead o usuário pode ver (RN-71) ----------
    const colConv = $app.findCollectionByNameOrId('whatsapp_conversas')
    const colSin = $app.findCollectionByNameOrId('whatsapp_sinais')
    const colConexoes = $app.findCollectionByNameOrId('whatsapp_conexoes')
    var conversas = []
    try {
      conversas = $app.findRecordsByFilter(colConv, "lead='" + lead.id + "'", '', 50, 0)
    } catch (eC) {}

    const visiveis = []
    for (const c of conversas) {
      let sinais = []
      try {
        sinais = $app.findRecordsByFilter(colSin, "conversa='" + c.id + "'", '', 1, 0)
      } catch (eS) {}
      if (!sinais || sinais.length === 0) continue
      const leitores = lerLista(sinais[0].get('leitores'))
      const souLeitor = leitores.indexOf(e.auth.id) >= 0
      if (souLeitor) {
        visiveis.push(c)
        continue
      }
      // gestão com escopo "todos" vê tudo
      if (temTudoLeads) {
        visiveis.push(c)
        continue
      }
      // dono da conversa (número do vendedor ligado ao perfil)
      let conexao = null
      try {
        conexao = $app.findRecordById('whatsapp_conexoes', String(c.get('conexao')))
      } catch (eCx) {}
      if (!conexao) continue
      const papel = String(conexao.get('papel') || '')
      const vendedorDaConexao = String(conexao.get('vendedor_user') || '')
      if (papel === 'vendedor' && vendedorDaConexao === e.auth.id) {
        visiveis.push(c)
        continue
      }
      // central: só a conversa dos leads que estão com ele
      if (
        papel === 'central' &&
        String(lead.get('owner_id') || '') === e.auth.id &&
        String(lead.get('owner_id') || '') !== ''
      ) {
        visiveis.push(c)
      }
    }

    // ---------- auditoria da abertura ----------
    try {
      const colAudit = $app.findCollectionByNameOrId('access_audit')
      const au = new Record(colAudit)
      au.set('at', new Date().toISOString())
      au.set('acao', 'read_conversa')
      au.set('alvo', lead.id)
      au.set('detalhe', { conversas: visiveis.length, usuario: e.auth.id })
      $app.save(au)
    } catch (eA) {}

    if (visiveis.length === 0) {
      // lead conhecido, mas sem conversa que este usuário possa abrir
      return e.json(403, {
        ok: false,
        erro: 'sem permissão para ver a conversa deste lead',
        detalhe: 'nenhuma conversa deste lead está liberada para o seu acesso',
      })
    }

    // ---------- mensagens ----------
    const ids = []
    for (const c of visiveis) ids.push(c.id)
    var filtro = ''
    for (let i = 0; i < ids.length; i++) {
      if (i > 0) filtro += ' || '
      filtro += "conexaoConversa='" + ids[i] + "'"
    }
    const colMsg = $app.findCollectionByNameOrId('whatsapp_mensagens')
    var msgs = []
    try {
      // busca por conversa via campo derivado: usa contato_telefone + conexao
      const filtros = []
      for (const c of visiveis) {
        filtros.push(
          "(conexao='" +
            String(c.get('conexao')) +
            "' && contato_telefone='" +
            String(c.get('contato_telefone')) +
            "')",
        )
      }
      msgs = $app.findRecordsByFilter(colMsg, filtros.join(' || '), '', 200, 0)
    } catch (eM) {
      return e.json(200, { ok: true, lead: lead.id, total: 0, itens: [], aviso: 'sem_leitura' })
    }

    const itens = []
    for (const m of msgs) {
      const apagada = String(m.get('apagada_em') || '') !== ''
      itens.push({
        id: m.id,
        autor: m.get('autor'),
        autor_user: m.get('autor_user'),
        direcao: m.get('direcao'),
        tipo: m.get('tipo'),
        // texto como TEXTO (nunca HTML): a tela renderiza literal
        texto: apagada ? '' : String(m.get('texto') || ''),
        texto_original: String(m.get('texto_original') || ''),
        media_url: apagada ? '' : String(m.get('media_url') || ''),
        media_url_temporaria: String(m.get('media_url_temporaria')) === 'true',
        media_mimetype: m.get('media_mimetype'),
        media_duracao_s: m.get('media_duracao_s'),
        media_ptt: String(m.get('media_ptt')) === 'true',
        status: m.get('status'),
        enviada_em: String(m.get('enviada_em') || ''),
        editada_em: String(m.get('editada_em') || ''),
        apagada: apagada,
        numero: String(m.get('contato_telefone') || ''),
      })
    }
    // ordem cronológica
    itens.sort(function (a, b) {
      return String(a.enviada_em) < String(b.enviada_em) ? -1 : 1
    })

    return e.json(200, {
      ok: true,
      lead: lead.id,
      total: itens.length,
      conversas: visiveis.length,
      itens: itens,
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/whatsapp/conversas',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      60,
      0,
    )
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
      } catch (e) {}
      return Array.isArray(out) ? out : []
    }
    var temConversas = false
    var temTudoLeads = false
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
      if (ate !== '' && ate.slice(0, 10) < hoje) continue
      const acts = lerLista(g.get('actions'))
      if (acts.indexOf('read_conversas') >= 0) temConversas = true
      if (acts.indexOf('read_leads') >= 0) {
        const sa = lerLista(g.get('scope_accounts'))
        // escopo VAZIO = só os leads do próprio (deny por padrão); '*' = tudo.
        // Antes vazio virava "tudo" e o vendedor via a conversa da central.
        if (sa.indexOf('*') >= 0) temTudoLeads = true
      }
    }
    if (!temConversas) {
      return e.json(403, { ok: false, erro: 'sem permissão para ler conversas (read_conversas)' })
    }
    // e.auth.email vem VAZIO no JSVM: sem ler do banco, o usuário de teste nunca
    // é reconhecido como fixture e a tela dele não mostra as conversas de teste.
    var emailAuth = ''
    try {
      emailAuth = String($app.findRecordById('users', e.auth.id).get('email') || '')
    } catch (eEm) {}
    const ehFixture = emailAuth.toLowerCase().indexOf('fixture') >= 0
    const colConv = $app.findCollectionByNameOrId('whatsapp_conversas')
    const colSin = $app.findCollectionByNameOrId('whatsapp_sinais')
    const colConexoes = $app.findCollectionByNameOrId('whatsapp_conexoes')
    // ---------- empresa ativa (CA-3-88) ----------
    // `X-Empresa` sem grant -> 403. Sem header, usa a empresa do grant; o dono
    // (escopo '*') pode qualquer uma.
    var empresaAtiva = ''
    var temTudoC = false
    var empDoGrantC = []
    for (const gEmpC of meus) {
      var saC = lerLista(gEmpC.get('scope_accounts'))
      if (Array.isArray(saC) && saC.indexOf('*') >= 0) temTudoC = true
      var empGC = ''
      try {
        empGC = String(gEmpC.get('empresa') || '')
      } catch (eGEC) {}
      if (empGC !== '' && empDoGrantC.indexOf(empGC) < 0) empDoGrantC.push(empGC)
    }
    var pedidaC = ''
    try {
      pedidaC = String(e.request.header.get('X-Empresa') || '')
    } catch (ePC) {}
    if (pedidaC !== '') {
      if (!temTudoC && empDoGrantC.indexOf(pedidaC) < 0) {
        return e.json(403, { ok: false, erro: 'sem acesso a esta empresa' })
      }
      empresaAtiva = pedidaC
    } else if (empDoGrantC.length > 0) {
      empresaAtiva = empDoGrantC[0]
    } else {
      try {
        const esC2 = $app.findRecordsByFilter('empresas', 'ativa=true', '', 1, 0)
        if (esC2.length > 0) empresaAtiva = esC2[0].id
      } catch (eEC2) {}
    }

    // LIMITE 200 SEM ORDENAÇÃO — corrigido em 05/11 (relato do dono: "no
    // celular do vendedor não aparece e no sistema ele não consegue
    // responder"). O PocketBase devolvia 200 conversas ARBITRÁRIAS de 207 e a
    // conversa recém-atribuída pelo rodízio ficava fora do corte, invisível
    // para o dono do lead. Sem `sort` (o JSVM lança), então leio todas e
    // ordeno em JS pela última mensagem.
    var todas = []
    try {
      // CA-3-88: só conversas da empresa ATIVA
      const filtroEmpC = empresaAtiva !== '' ? " && empresa='" + empresaAtiva + "'" : ''
      todas = $app.findRecordsByFilter(
        colConv,
        'fixture=' + (ehFixture ? 'true' : 'false') + filtroEmpC,
        '',
        5000,
        0,
      )
      // ordena da mais recente para a mais antiga (a tela mostra nessa ordem)
      todas.sort(function (a, b) {
        const ka = String(a.get('ultima_mensagem_em') || a.get('created') || '')
        const kb = String(b.get('ultima_mensagem_em') || b.get('created') || '')
        return kb.localeCompare(ka)
      })
    } catch (e) {}

    // ordena os REGISTROS antes de montar a lista: `created` existe no
    // registro, não no objeto que vai para a tela.
    todas.sort(function (x, y) {
      const kx = String(x.get('ultima_mensagem_em') || '') || String(x.get('created') || '')
      const ky = String(y.get('ultima_mensagem_em') || '') || String(y.get('created') || '')
      if (kx === ky) return 0
      return kx < ky ? 1 : -1
    })

    var itens = []
    for (const c of todas) {
      // pode ver?
      let pode = temTudoLeads
      if (!pode) {
        let sinais = []
        try {
          sinais = $app.findRecordsByFilter(colSin, "conversa='" + c.id + "'", '', 1, 0)
        } catch (eS) {}
        if (sinais && sinais.length > 0) {
          const leitores = lerLista(sinais[0].get('leitores'))
          if (leitores.indexOf(e.auth.id) >= 0) {
            // DECISÃO DO DONO (09/11): `leitores` NÃO fura a regra do dono.
            // Se o lead tem outro dono, a conversa não é sua — mesmo que o
            // sinal liste você (o sinal é recalculado e pode estar velho).
            var outroDono = false
            const lidL = String(c.get('lead') || '')
            if (lidL !== '') {
              try {
                const lL = $app.findRecordById('crm_leads', lidL)
                const ow = String(lL.get('owner_id') || '')
                if (ow !== '' && ow !== e.auth.id) outroDono = true
              } catch (eL2) {}
            }
            if (!outroDono) pode = true
          }
        }
      }
      if (!pode) {
        let conexao = null
        try {
          conexao = $app.findRecordById('whatsapp_conexoes', String(c.get('conexao')))
        } catch (eC) {}
        if (conexao) {
          const papel = String(conexao.get('papel') || '')
          const vd = String(conexao.get('vendedor_user') || '')
          // REGRA DO DONO (decisão do dono, 09/11): o vendedor vê a conversa
          // quando é DONO DO LEAD — em qualquer número. NÃO basta ser o número
          // dele: se o cliente é da Adriana e falou pelo número do Fábio, a
          // conversa é da Adriana.
          //
          // Histórico: em 06/11 eu liberava o número inteiro (`papel==='vendedor'
          // && vd===e.auth.id`), o que fazia o Fábio ver conversa de cliente de
          // outra vendedora — 6 casos reais. Agora só o dono do lead.
          //
          // A central continua visível para o dono do lead (é o caso de 17
          // conversas que ficavam invisíveis antes).
          const lid = String(c.get('lead') || '')
          if (lid !== '') {
            try {
              const l = $app.findRecordById('crm_leads', lid)
              if (String(l.get('owner_id') || '') === e.auth.id) pode = true
            } catch (eL) {}
          }
          // conversa SEM lead no número dele: é dele (não há dono a respeitar)
          if (!pode && lid === '' && papel === 'vendedor' && vd === e.auth.id) pode = true
        }
      }
      if (!pode) continue
      let nomeNumero = ''
      // 11/11 (relato da gestão): a vendedora via conversas com o nome do
      // Fábio, da Adriana ou do Douglas e não sabia se a venda era dela. São
      // clientes DELA (dono do lead, regra do dono de 09/11) que falaram pelo
      // número de um colega — 10 a 17 por vendedor, medido em produção.
      // A tela passa a marcar: "Seu cliente · conversa no número de X".
      var deOutroVendedor = false
      try {
        const cx = $app.findRecordById('whatsapp_conexoes', String(c.get('conexao')))
        nomeNumero = String(cx.get('nome_exibicao') || '')
        deOutroVendedor =
          !temTudoLeads &&
          String(cx.get('papel') || '') === 'vendedor' &&
          String(cx.get('vendedor_user') || '') !== e.auth.id
      } catch (eN) {}
      itens.push({
        id: c.id,
        conexao: c.get('conexao'),
        numero_nome: nomeNumero,
        outro_numero: deOutroVendedor,
        contato_nome: c.get('contato_nome'),
        contato_telefone: c.get('contato_telefone'),
        lead: c.get('lead'),
        ultima_previa: c.get('ultima_previa'),
        ultima_mensagem_em: String(c.get('ultima_mensagem_em') || ''),
        ultimo_autor: c.get('ultimo_autor'),
        total_mensagens: c.get('total_mensagens'),
        estado: c.get('estado'),
        canal: c.get('canal'),
        // CA-3-25: conversa da EQUIPE (número interno) x conversa com CLIENTE
        interna: String(c.get('interna')) === 'true',
        // CA-3-70 (05/11) — NÃO LIDA = a última mensagem é do CLIENTE.
        // Decisão do dono: mesmo que o robô tenha falado no meio, se quem
        // falou por último foi o cliente, ele está esperando GENTE — conta
        // como não lida. Assim que a vendedora responde (pelo sistema ou pelo
        // celular, que o webhook espelha), `ultimo_autor` vira `vendedor` ou
        // `equipe_central` e a marcação some sozinha.
        nao_lida: String(c.get('ultimo_autor') || '') === 'cliente',
        espera_min: (function () {
          if (String(c.get('ultimo_autor') || '') !== 'cliente') return -1
          const q = new Date(String(c.get('ultima_mensagem_em') || '')).getTime()
          if (!(q > 0)) return -1
          return Math.round((new Date().getTime() - q) / 60000)
        })(),
      })
    }
    // CA-3-70 (05/11) — MAIS RECENTE SEMPRE NO TOPO, em todas as visões.
    // A tela filtra por número/aba/busca mas nunca reordena, então esta ordem
    // vale para "Todos os números" e para cada número isolado.
    // O comparador antigo afundava conversa SEM `ultima_mensagem_em` (string
    // vazia) para o fim, mesmo sendo nova — agora cai no `created` e, se nem
    // isso houver, vai para o fim de propósito.
    // CA-3-67 / RN-140c (05/11) — UM CLIENTE, UMA LINHA.
    // O mesmo cliente aparece duas vezes quando falou com a central e com o
    // número da vendedora (print "duplicado" da Sabrina). Aqui as conversas
    // dele são juntadas numa linha só, guardando DE ONDE veio cada mensagem
    // em `numeros` — a tela mostra o número em cada mensagem.
    //
    // A visão de um número só não passa por aqui: lá cada conversa continua
    // sendo uma linha, porque a tela inteira é daquele número.
    // Agrupa SEMPRE — em "Todos os números" e na visão de um número só.
    //
    // Motivo (05/11): encontrei 45 clientes com DOIS registros de conversa na
    // MESMA conexão (ex.: 554196778927 na central, um com 42 mensagens e outro
    // com 11). Isso é dado duplicado, não duas conversas: a tela mostraria o
    // mesmo cliente duas vezes na visão daquele número. Agrupar por telefone
    // resolve nos dois casos, e a SPEC (RN-140c) só exige que a visão por
    // número continue sendo por número — o que continua, porque todas as
    // conversas ali são daquele número.
    const agrupar = true
    var juntados = []
    var porTelefone = {}
    if (!agrupar) {
      juntados = itens
      for (const it of juntados) it.numeros = it.numero_nome ? [it.numero_nome] : []
    }
    for (const it of agrupar ? itens : []) {
      const tel = String(it.contato_telefone || '').replace(/\D/g, '')
      if (tel === '') {
        juntados.push(it)
        continue
      }
      const ja = porTelefone[tel]
      if (!ja) {
        // a primeira vira a linha do cliente; guarda os números por onde passou
        it.numeros = it.numero_nome ? [it.numero_nome] : []
        it.conversas = [it.id]
        porTelefone[tel] = it
        juntados.push(it)
        continue
      }
      // soma na linha existente
      if (it.numero_nome && ja.numeros.indexOf(it.numero_nome) < 0) {
        ja.numeros.push(it.numero_nome)
      }
      ja.conversas.push(it.id)
      ja.total_mensagens = Number(ja.total_mensagens || 0) + Number(it.total_mensagens || 0)
      // a linha mostra a mensagem MAIS RECENTE entre as conversas do cliente
      if (String(it.ultima_mensagem_em || '') > String(ja.ultima_mensagem_em || '')) {
        ja.id = it.id
        ja.conexao = it.conexao
        ja.numero_nome = it.numero_nome
        ja.outro_numero = it.outro_numero
        ja.ultima_previa = it.ultima_previa
        ja.ultima_mensagem_em = it.ultima_mensagem_em
        ja.ultimo_autor = it.ultimo_autor
        ja.estado = it.estado
        ja.nao_lida = it.nao_lida
        ja.espera_min = it.espera_min
        if (!ja.lead) ja.lead = it.lead
      }
      // se QUALQUER conversa do cliente está esperando, a linha está
      if (it.nao_lida === true) {
        ja.nao_lida = true
        const e1 = Number(ja.espera_min)
        const e2 = Number(it.espera_min)
        if (!(e1 >= 0) || (e2 >= 0 && e2 > e1)) ja.espera_min = it.espera_min
      }
    }
    if (agrupar) itens = juntados

    itens.sort(function (x, y) {
      const ka = String(x.ultima_mensagem_em || '')
      const kb = String(y.ultima_mensagem_em || '')
      if (ka === kb) return 0
      return ka < kb ? 1 : -1
    })
    return e.json(200, { ok: true, total: itens.length, itens: itens })
  },
  $apis.requireAuth(),
)
