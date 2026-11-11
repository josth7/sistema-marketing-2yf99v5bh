/// <reference path="../pb_data/types.d.ts" />
/**
 * CRON DO ROTEIRO — responde só quem chega com o GATILHO do anúncio (30/10).
 *
 * Decisão do dono: "siga como no agente atual". O agente atual da Movienari
 * só responde quem chega com o texto do gatilho; quem chega sem gatilho NÃO
 * recebe resposta automática (artifacts/agente-atendimento-haisan.md, seção 5).
 *
 * Gatilhos (tipo Contém, como no painel):
 *   Google  → "Olá! Vi o anúncio da Haisan no Google"
 *   Meta    → "Olá! Vi o anúncio da Haisan" + Instagram/Facebook/Meta
 *   sem qualificador → META (o doc pede: "mensagens não-decifráveis" ATIVO,
 *                      o agente entra em lead de anúncio sem gatilho decifrável)
 * Sem gatilho → conversa fica em `sem_gatilho`: nenhuma resposta automática.
 *
 * O canal detectado alimenta o roteiro (organico pergunta a origem; meta não).
 *
 * LIÇÃO JSVM: `function`/`var` no TOPO quebra o arquivo inteiro (404 em tudo).
 * Aqui a decisão está INLINE dentro do callback do cron.
 */

cronAdd('wa_roteiro', '* * * * *', () => {
  // SONDA (04/11): prova que este cron roda. A sonda_cron roda; o motor não
  // registrava nada. Sem esta batida eu não sabia se o problema era o
  // agendador ou a lógica.
  try {
    const colS = $app.findCollectionByNameOrId('diag_cron_sonda')
    const rS = new Record(colS)
    rS.set('job', 'wa_roteiro')
    rS.set('quando', new Date().toISOString())
    $app.save(rS)
  } catch (eS0) {}

  // liga/desliga o ENVIO real. Enquanto a Meta bloquear (130497), fica false:
  // o motor decide, grava a etapa e MARCA no log, mas não enfileira.
  // MODO_ENSAIO deixa de ser constante: passa a seguir o painel.
  // Painel LIGADO = o robo responde de verdade (enfileira). DESLIGADO = nao.
  // Antes era `true` fixo e o botao Ligar nao teria efeito nenhum (item 4).
  var MODO_ENSAIO = true

  try {
    // ---------- conexão central ----------
    const colCx = $app.findCollectionByNameOrId('whatsapp_conexoes')
    var centrais = []
    try {
      centrais = $app.findRecordsByFilter(colCx, "papel='central' && ativo=true", '', 5, 0)
    } catch (e0) {
      return
    }
    if (centrais.length === 0) return
    const central = centrais[0]

    // ---------- CONFIGURACAO DO PAINEL (item 4) ----------
    // O painel da gestao grava `atendimento_config`; sem ler aqui, o botao
    // "Ligar/Desligar" da tela nao controlaria nada de verdade. Le a versao
    // de maior numero (a mais nova) e obedece:
    //   ligado=false     -> nao responde ninguem
    //   usar_horario     -> fora do horario, nao responde
    //   janela_min       -> mensagem mais velha que isso fica para a equipe
    // BUG CORRIGIDO (11/11): antes pegava a config de MAIOR versão do sistema.
    // Quando a Gol 7 nasceu (v12, ligado=false), o robô da HAISAN passou a ler
    // a config da Gol 7 e sair por "desligado" — ficou 1 dia sem responder
    // ninguém. Agora filtra pela empresa da CONEXÃO CENTRAL (que é a empresa
    // que este cron atende).
    var cfg = null
    try {
      const colCfg = $app.findCollectionByNameOrId('atendimento_config')
      var empDaCentral = ''
      try {
        empDaCentral = String(central.get('empresa') || '')
      } catch (eEmpC) {}
      const vs = $app.findRecordsByFilter(
        colCfg,
        empDaCentral !== '' ? "empresa='" + empDaCentral + "'" : '',
        '',
        200,
        0,
      )
      var maior = -1
      for (const v of vs) {
        const n = Number(v.get('versao') || 0)
        if (n > maior) {
          maior = n
          cfg = v
        }
      }
      // central sem empresa definida? cai na maior versão (compatibilidade)
      if (!cfg) {
        const vs2 = $app.findRecordsByFilter(colCfg, '', '', 200, 0)
        for (const v of vs2) {
          const n = Number(v.get('versao') || 0)
          if (n > maior) {
            maior = n
            cfg = v
          }
        }
      }
    } catch (eCfg) {}

    if (cfg) {
      if (cfg.get('ligado') !== true) return // desligado pelo painel
      MODO_ENSAIO = false // ligado no painel => o robo responde
      // horario (Brasilia): usa_horario + dias + faixa
      if (cfg.get('usar_horario') === true) {
        var agoraBR = new Date(new Date().getTime() - 3 * 3600 * 1000)
        var diaSem = agoraBR.getUTCDay()
        var hhmm =
          String(agoraBR.getUTCHours()).padStart(2, '0') +
          ':' +
          String(agoraBR.getUTCMinutes()).padStart(2, '0')
        var dias = []
        try {
          const rawD = cfg.get('dias')
          dias =
            Array.isArray(rawD) && rawD.length > 0 && typeof rawD[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, rawD))
              : typeof rawD === 'string'
                ? JSON.parse(rawD)
                : rawD || []
        } catch (eD) {}
        const dentroDia = dias.indexOf(diaSem) >= 0
        const dentroHora =
          hhmm >= String(cfg.get('hora_inicio') || '00:00') &&
          hhmm <= String(cfg.get('hora_fim') || '23:59')
        if (!dentroDia || !dentroHora) return
      }
    }

    // ---------- textos, perguntas e palavras do painel (tela Atendimento) ----------
    // A gestão edita na tela Atendimento; cada salvamento é uma versão nova em
    // `atendimento_config` (a de maior número vale). Campo vazio ou ausente =
    // texto/lista padrão escrito abaixo. NÃO trocar por texto fixo: a tela
    // Atendimento deixaria de ter efeito (regra da SPEC do atendimento).
    const lerCfg = function (campo, padrao) {
      if (!cfg) return padrao
      try {
        const raw = cfg.get(campo)
        var s = ''
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number')
          s = String.fromCharCode.apply(null, raw)
        else if (typeof raw === 'string') s = raw
        else if (raw !== null && raw !== undefined) return raw
        if (s === '') return padrao
        const v = JSON.parse(s)
        return v === null || v === undefined ? padrao : v
      } catch (eJ) {
        return padrao
      }
    }
    const TXT = lerCfg('textos', {}) || {}
    const PAL = lerCfg('palavras', {}) || {}
    const FAQ_CFG = lerCfg('faq', null)
    // texto do painel; vazio ou ausente = texto padrão
    const tx = function (chave, padrao) {
      const v = TXT[chave]
      return typeof v === 'string' && v.trim() !== '' ? v : padrao
    }
    // lista de palavras do painel; vazia ou ausente = lista padrão
    const lst = function (chave, padrao) {
      const v = PAL[chave]
      if (!Array.isArray(v)) return padrao
      const out = []
      for (const x of v) {
        const s2 = String(x || '').trim()
        if (s2 !== '') out.push(s2)
      }
      return out.length > 0 ? out : padrao
    }

    // ---------- consultor do rodízio (nome + número reais) ----------
    const colU = $app.findCollectionByNameOrId('users')
    const colGe = $app.findCollectionByNameOrId('access_grants')
    const colL = $app.findCollectionByNameOrId('crm_leads')
    var consultor = { id: '', nome: '', numero: '' }
    var vendedores = []
    try {
      const us = $app.findRecordsByFilter(colU, '', '', 200, 0)
      const todosLeads = $app.findRecordsByFilter(colL, 'fixture=false', '', 6000, 0)
      const carga = {}
      for (const l0 of todosLeads) {
        const ow = String(l0.get('owner_id') || '')
        if (ow === '') continue
        const st0 = String(l0.get('status') || 'entrada_lead')
        if (st0 === 'venda_realizada' || st0 === 'finalizado' || st0 === 'descartado') continue
        carga[ow] = (carga[ow] || 0) + 1
      }
      for (const u of us) {
        const em = String(u.get('email') || '')
        const nm = String(u.get('name') || '')
        if (em === '' || em.toLowerCase().indexOf('fixture') >= 0) continue
        if (nm.toLowerCase().indexOf('fixture') >= 0) continue
        if (em.indexOf('josth') >= 0) continue
        var vd = false
        var gt = false
        try {
          const gs = $app.findRecordsByFilter(
            colGe,
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
            if (Array.isArray(sc) && sc.indexOf('*') >= 0) gt = true
            if (a.indexOf('read_conversas') >= 0 || a.indexOf('read_leads') >= 0) vd = true
          }
        } catch (eG) {}
        if (!vd || gt) continue
        vendedores.push({ id: u.id, nome: nm || em, carga: carga[u.id] || 0 })
      }
      vendedores.sort(function (a, b) {
        return a.carga - b.carga
      })
    } catch (e1) {}

    var cxsVend = []
    try {
      cxsVend = $app.findRecordsByFilter(colCx, "papel='vendedor' && ativo=true", '', 20, 0)
    } catch (e2) {}

    if (vendedores.length > 0) {
      consultor.id = vendedores[0].id
      consultor.nome = vendedores[0].nome
      for (const c of cxsVend) {
        if (String(c.get('vendedor_user') || '') !== consultor.id) continue
        const nd = String(c.get('numero') || '').replace(/[^0-9]/g, '')
        if (nd.length === 13)
          consultor.numero = '(' + nd.slice(2, 4) + ') ' + nd.slice(4, 9) + '-' + nd.slice(9)
        else if (nd.length === 12)
          consultor.numero = '(' + nd.slice(2, 4) + ') ' + nd.slice(4, 8) + '-' + nd.slice(8)
      }
    }

    // ---------- conversas da central em triagem ----------
    const colCv = $app.findCollectionByNameOrId('whatsapp_conversas')
    var conversas = []
    try {
      // CORREÇÃO 04/11: o limite era 40 e há 71 conversas em triagem — cliente
      // novo podia cair FORA da amostra e nunca ser atendido (o cron "rodava" e
      // simplesmente não olhava para ele). Sem `sort` (o JSVM lança), então o
      // PocketBase devolvia 40 registros arbitrários. Agora lê todas e escolhe
      // as 60 mais recentes em JS.
      conversas = $app.findRecordsByFilter(
        colCv,
        // fixture=false: conversa de teste NUNCA recebe resposta automatica
        "conexao='" + central.id + "' && estado='triagem' && fixture=false",
        '',
        2000,
        0,
      )
      // sem sort em JS: ordenar Records aqui derruba o hook (04/11). O limite
      // alto já garante que todas em triagem entram.
    } catch (e3) {
      return
    }

    const colMsg = $app.findCollectionByNameOrId('whatsapp_mensagens')
    const colEnv = $app.findCollectionByNameOrId('whatsapp_envios')

    const HORARIO = tx(
      'horario',
      'Nosso horário de atendimento é de segunda a sexta, das 8:00h às 17:30h. Se você mandou essa mensagem fora desse horário, um vendedor vai te responder assim que abrir o expediente. Obrigado pela paciência! ✨',
    )
    const MENU_META = tx(
      'menu_meta',
      'Bem-vindo(a) a *Haisan*! 💎\n' +
        'Somos uma *fábrica brasileira de móveis* para salão de beleza, barbearia e clínica de estética, com *mais de 30 anos* de história.\n' +
        'Você está falando com o *assistente virtual da Haisan*. 😃\n' +
        'Para agilizar seu atendimento, pode nos dizer qual linha é do seu interesse?\n' +
        '💈 *Barbearia*\n🪞 *Salão de Beleza*\n🧴 *Podologia ou Estética*\n💅 *Manicure e Pedicure*',
    )
    const MENU_ORGANICO = tx(
      'menu_organico',
      'Bem-vindo(a) a *Haisan*! 💎\n' +
        'Somos uma *fábrica brasileira de móveis* para salão de beleza, barbearia e clínica de estética, com *mais de 30 anos* de história.\n' +
        'Você está falando com o *assistente virtual da Haisan*. 😃\n' +
        'Para agilizar seu atendimento, pode nos dizer qual linha é do seu interesse?\n' +
        '💈 *Barbearia*\n🪞 *Salão de Beleza*\n🧴 *Podologia ou Estética*\n💅 *Manicure e Pedicure*\n🛠️ *Manutenção dos móveis Haisan*',
    )

    function normalizar(t) {
      var s = String(t || '').toLowerCase()
      s = s.replace(/[áàâãä]/g, 'a')
      s = s.replace(/[éèêë]/g, 'e')
      s = s.replace(/[íìîï]/g, 'i')
      s = s.replace(/[óòôõö]/g, 'o')
      s = s.replace(/[úùûü]/g, 'u')
      s = s.replace(/[ç]/g, 'c')
      return s
    }
    function contem(texto, lista) {
      var t = normalizar(texto)
      for (var i = 0; i < lista.length; i++) {
        if (t.indexOf(normalizar(lista[i])) >= 0) return true
      }
      return false
    }

    for (const cv of conversas) {
      try {
        // ---------- última mensagem ----------
        // sort sempre VAZIO: findRecordsByFilter com sort lanca erro no JSVM e
        // o catch engolia a conversa em silencio (era por isso que o cron
        // rodava e nada acontecia, 03/11). Ordeno em JS.
        var ultimas = []
        try {
          // vinculo por conexao + telefone: whatsapp_mensagens NAO tem campo
          // `conversa` (era a causa do "invalid filter expression", 03/11)
          ultimas = $app.findRecordsByFilter(
            colMsg,
            "conexao='" +
              String(cv.get('conexao') || '') +
              "' && contato_telefone='" +
              String(cv.get('contato_telefone') || '') +
              "'",
            '',
            12,
            0,
          )
        } catch (e4) {
          continue
        }
        ultimas.sort(function (a, b) {
          return String(b.get('created') || '').localeCompare(String(a.get('created') || ''))
        })
        if (ultimas.length === 0) continue
        const ultima = ultimas[0]
        // cliente tem de falar por ultimo. So isso ja garante que nao ha
        // resposta nossa depois da mensagem dele: a lista esta em ordem
        // decrescente, entao ultimas[0] e a mais recente.
        // (Antes eu olhava "existe alguma saida nas ultimas 12?" — e isso
        // BLOQUEAVA conversa real: cliente escreve de novo depois de uma
        // resposta antiga e a IA nunca mais falava. 03/11.)
        if (String(ultima.get('direcao')) !== 'entrada') continue

        // janela em minutos do painel: mensagem mais velha fica para a equipe
        // responder pelo celular (evita o robo responder coisa de dias atras)
        const janelaMin = cfg ? Number(cfg.get('janela_min') || 0) : 0
        if (janelaMin > 0) {
          const quando = new Date(String(ultima.get('created') || '')).getTime()
          if (quando > 0 && new Date().getTime() - quando > janelaMin * 60000) continue
        }

        // ja respondemos ESTA mensagem? usa `ultima_resposta_ia_em` (campo que
        // ja existe). Sem isso, em modo ensaio ou antes do webhook confirmar o
        // envio, o cron decidiria de novo a cada minuto e duplicaria.
        const ultimaIa = String(cv.get('ultima_resposta_ia_em') || '')
        const criadaMsg = String(ultima.get('created') || '')
        if (ultimaIa !== '' && criadaMsg !== '' && ultimaIa >= criadaMsg) continue

        const texto = String(ultima.get('texto') || '')

        // lead da conversa (para herdar a atribuicao de anuncio)
        var lead = null
        if (String(cv.get('lead') || '') !== '') {
          try {
            lead = $app.findRecordById(colL, String(cv.get('lead')))
          } catch (eLead) {}
        }

        // consultor DESTA conversa (04/11): o rodízio do wa_aviso_lead_novo dá
        // dono ao lead em até 5 min. Se o lead já tem dono, é o nome e o número
        // dele que o cliente tem de receber na transferência — e não o vendedor
        // de menor carga neste minuto (antes o cliente ouvia um nome e o lead
        // ficava com outro vendedor).
        var cons = { id: consultor.id, nome: consultor.nome, numero: consultor.numero }
        if (lead && String(lead.get('owner_id') || '') !== '') {
          const donoId = String(lead.get('owner_id'))
          var donoNome = ''
          var donoNumero = ''
          var donoDigitos = ''
          try {
            const ud = $app.findRecordById(colU, donoId)
            donoNome = String(ud.get('name') || ud.get('email') || '')
          } catch (eUd) {}
          for (const cxd of cxsVend) {
            if (String(cxd.get('vendedor_user') || '') !== donoId) continue
            const pub = String(cxd.get('vendedor_nome_publico') || '')
            if (pub !== '') donoNome = pub
            const ndd = String(cxd.get('numero') || '').replace(/[^0-9]/g, '')
            // CA-3-44 (05/11): guarda os DIGITOS da conexao do vendedor, que é
            // o que o link wa.me precisa. `donoNumero` é a versão bonita para
            // ler no texto.
            if (ndd.length === 13 || ndd.length === 12) donoDigitos = ndd
            if (ndd.length === 13)
              donoNumero = '(' + ndd.slice(2, 4) + ') ' + ndd.slice(4, 9) + '-' + ndd.slice(9)
            else if (ndd.length === 12)
              donoNumero = '(' + ndd.slice(2, 4) + ') ' + ndd.slice(4, 8) + '-' + ndd.slice(8)
          }
          if (donoNome !== '')
            cons = { id: donoId, nome: donoNome, numero: donoNumero, digitos: donoDigitos }
        }

        // ---------- SPAM: nunca responde ----------
        // mensagem com cara de golpe/corrente. Se responder, o numero leva
        // denuncia e a reputacao cai (justo o que nao podemos agora).
        var tSpam = normalizar(texto)
        if (
          tSpam.indexOf('auxilio') >= 0 ||
          tSpam.indexOf('reconstrucao 2026') >= 0 ||
          tSpam.indexOf('consulta liberada') >= 0 ||
          tSpam.indexOf('clique no link') >= 0 ||
          tSpam.indexOf('ganhe dinheiro') >= 0 ||
          tSpam.indexOf('emprestimo') >= 0 ||
          tSpam.indexOf('sorteio') >= 0
        ) {
          try {
            cv.set('canal', 'sem_gatilho')
            $app.save(cv)
          } catch (eSpam) {}
          continue
        }

        // ---------- CANAL: ATRIBUIÇÃO REAL, NÃO TEXTO ----------
        // MUDANÇA DE 03/11 (a regra antiga barrava lead de anúncio):
        // a Meta não manda "vi o anúncio" em texto — manda o `referral` com a
        // mensagem. O texto do gatilho era premissa do agente antigo, que lia
        // texto; no WhatsApp oficial a atribuição vem em campo próprio.
        // Agora:
        //   1) tem anúncio salvo na conversa/lead  -> `meta`
        //   2) texto menciona google               -> `google`
        //   3) texto tem o gatilho antigo          -> `meta`
        //   4) nada disso                          -> `organico` (pergunta a
        //      origem), em vez de silenciar o cliente
        var canal = String(cv.get('canal') || '')
        var etapaAtual = String(cv.get('etapa_atual') || '')
        if (canal === 'sem_gatilho') canal = '' // reprocessa as antigas
        if (etapaAtual === '') {
          var tNorm = normalizar(texto)
          var anuncioId = String(cv.get('anuncio_id') || '')
          if (anuncioId === '' && lead) {
            try {
              anuncioId = String(lead.get('anuncio_id') || '')
            } catch (eAd) {}
          }
          if (anuncioId !== '' || String(cv.get('anuncio_url') || '') !== '') {
            canal = 'meta'
          } else if (tNorm.indexOf('google') >= 0) {
            canal = 'google'
          } else if (
            tNorm.indexOf('vi o anuncio') >= 0 ||
            tNorm.indexOf('anuncio da haisan') >= 0
          ) {
            canal = 'meta'
          } else if (
            tNorm.indexOf('instagram') >= 0 ||
            tNorm.indexOf('facebook') >= 0 ||
            tNorm.indexOf('insta') >= 0
          ) {
            canal = 'meta'
          } else {
            // chegou sem atribuição: trata como orgânico e PERGUNTA a origem.
            // Antes daqui saía `sem_gatilho` + silêncio, e o cliente ficava
            // sem resposta (17 casos medidos em 03/11).
            canal = 'organico'
          }
          try {
            cv.set('canal', canal)
            $app.save(cv)
          } catch (eC1) {}
        }
        if (canal === 'sem_gatilho') canal = 'organico'
        const MENU = canal === 'meta' ? MENU_META : MENU_ORGANICO

        // ---------- DECISÃO (inline, mesmas regras da rota simular) ----------
        var respostas = []
        var novoEtapa = etapaAtual
        var transfere = false
        var motivo = ''
        var origemDetectada = ''

        const SINAIS_HUMANO = lst('humano', [
          'atendente',
          'humano',
          'pessoa de verdade',
          'alguem de verdade',
          'falar com alguem',
          'falar com uma pessoa',
          'vendedor',
          'vendedora',
          'quero falar',
          'me liga',
          'saco',
          'robo',
          'bot',
          'atendimento real',
        ])
        const SINAIS_ESTRESSE = lst('estresse', [
          'pessimo',
          'horrivel',
          'absurdo',
          'ridiculo',
          'ninguem responde',
          'ja pedi',
          'de novo',
          'urgente',
          'procon',
          'processo',
          'reclamacao',
        ])
        const FORA_ESCOPO = lst('fora_escopo', [
          'preco',
          'valor',
          'quanto custa',
          'quanto e',
          'orcamento',
          'frete',
          'pagamento',
          'parcela',
          'desconto',
          'disponivel',
          'tem pronto',
          'estoque',
        ])
        const FAQ_PADRAO = [
          {
            chaves: ['prazo', 'quanto tempo', 'demora', 'producao', 'entrega'],
            resposta:
              'O nosso prazo de produção é de 30 dias corridos. Mas também o prazo de transporte que deve ser confirmado com o nosso time de vendas.',
          },
          {
            chaves: ['endereco', 'onde fica', 'onde voces ficam', 'localizacao', 'showroom'],
            resposta:
              'Estamos na Rua Kival Fernando Pereira, 125, Centro, São José dos Pinhais – PR. Temos fábrica e showroom no mesmo endereço.',
          },
        ]
        var FAQ = FAQ_PADRAO
        if (Array.isArray(FAQ_CFG) && FAQ_CFG.length > 0) {
          FAQ = []
          for (const fq of FAQ_CFG) {
            if (!fq) continue
            const chs = []
            const brutas = Array.isArray(fq.chaves) ? fq.chaves : String(fq.chaves || '').split(',')
            for (const c0 of brutas) {
              const c1 = String(c0 || '').trim()
              if (c1 !== '') chs.push(c1)
            }
            const resp = String(fq.resposta || '').trim()
            if (chs.length > 0 && resp !== '') FAQ.push({ chaves: chs, resposta: resp })
          }
          if (FAQ.length === 0) FAQ = FAQ_PADRAO
        }
        const LINHAS = [
          { chave: 'barbearia', termos: ['barbearia', 'barbeiro', 'barber'] },
          { chave: 'salao', termos: ['salao', 'cabeleireiro', 'cabelo'] },
          { chave: 'podologia', termos: ['podologia', 'podologo', 'estetica', 'esteta'] },
          { chave: 'manicure', termos: ['manicure', 'pedicure', 'unha'] },
          {
            chave: 'manutencao',
            termos: ['manutencao', 'consertar', 'conserto', 'quebrou', 'reparo'],
          },
        ]
        for (const ln of LINHAS) ln.termos = lst('linha_' + ln.chave, ln.termos)
        // modelo editável no painel: {nome} e {numero} são trocados pelo
        // consultor desta conversa (dono do lead ou o próximo do rodízio)
        // CA-3-44 (05/11) — LINK DIRETO DO VENDEDOR. Aprovado pelo dono em
        // 05/11. O cliente toca e o WhatsApp dele abre a conversa com a
        // vendedora JÁ com a primeira mensagem escrita. Texto livre dentro da
        // janela de 24h que o próprio cliente abriu na central: sem custo.
        //
        // Sem número do vendedor não há link — a frase sem número continua
        // valendo (`transferencia_consultor_sem_numero`).
        const digitosVend = String(cons.digitos || String(cons.numero || '').replace(/[^0-9]/g, ''))
        var linkVendedor = ''
        if (digitosVend.length >= 12) {
          linkVendedor =
            'https://wa.me/' +
            digitosVend +
            '?text=' +
            encodeURIComponent(
              'Oi, ' + String(cons.nome || '').split(' ')[0] + '! Vim do atendimento da Haisan',
            )
        }
        const TXT_CONSULTOR = (
          linkVendedor !== ''
            ? tx(
                'transferencia_consultor',
                'Certo! 😊 Já te encaminhei pro nosso time de vendas! Quem vai te atender: *{nome}*.\nFala direto por aqui: {link}\nPode salvar como *Haisan Vendas*! 😊',
              )
            : tx(
                'transferencia_consultor_sem_numero',
                'Certo! 😊 Já te encaminhei pro nosso time de vendas! Seu consultor será o *{nome}*. Pode salvar como *Haisan Vendas*! 😊',
              )
        )
          .split('{nome}')
          .join(cons.nome || 'nosso time')
          .split('{numero}')
          .join(cons.numero || '')
          .split('{link}')
          .join(linkVendedor)

        if (contem(texto, SINAIS_HUMANO)) {
          novoEtapa = 'humano'
          motivo = 'cliente_pediu_humano'
          transfere = true
          respostas = [
            tx(
              'encaminhar_humano',
              'Entendo! Vou te encaminhar AGORA para um dos nossos vendedores, só um momento! ☺️',
            ),
            HORARIO,
          ]
        } else if (contem(texto, SINAIS_ESTRESSE)) {
          novoEtapa = 'humano'
          motivo = 'cliente_impaciente'
          transfere = true
          respostas = [
            tx(
              'encaminhar_humano',
              'Entendo! Vou te encaminhar AGORA para um dos nossos vendedores, só um momento! ☺️',
            ),
            HORARIO,
          ]
        } else {
          var faqA = null
          for (var f2 = 0; f2 < FAQ.length; f2++) {
            if (contem(texto, FAQ[f2].chaves)) {
              faqA = FAQ[f2]
              break
            }
          }
          if (faqA) {
            motivo = 'faq'
            respostas = [faqA.resposta]
          } else if (contem(texto, FORA_ESCOPO)) {
            novoEtapa = 'humano'
            motivo = 'pergunta_fora_do_escopo'
            transfere = true
            respostas = [
              tx('fora_escopo', 'Vou te encaminhar para um de nossos vendedores, só um momento!'),
              HORARIO,
            ]
          } else if (etapaAtual === '') {
            novoEtapa = 'menu'
            motivo = 'boas_vindas'
            respostas = [MENU]
          } else if (etapaAtual === 'menu' || etapaAtual === 'menu_r') {
            var linhaA = null
            for (var l2 = 0; l2 < LINHAS.length; l2++) {
              if (contem(texto, LINHAS[l2].termos)) {
                linhaA = LINHAS[l2]
                break
              }
            }
            if (!linhaA && etapaAtual === 'menu_r') {
              // 2ª resposta que o robô não entende: passa para o vendedor, como o
              // agente antigo fazia com o que fugia do roteiro (antes repetia o
              // menu sem fim, 04/11)
              novoEtapa = 'humano'
              motivo = 'menu_nao_entendido_2x'
              transfere = true
              respostas = [
                tx('fora_escopo', 'Vou te encaminhar para um de nossos vendedores, só um momento!'),
                HORARIO,
              ]
            } else if (!linhaA) {
              novoEtapa = 'menu_r'
              motivo = 'menu_opcao_invalida'
              respostas = [
                tx('nao_entendi', 'Desculpe, não entendi. 😊 Pode escolher uma das opções?'),
                MENU,
              ]
            } else if (linhaA.chave === 'manutencao') {
              novoEtapa = 'manut1'
              motivo = 'manutencao_pede_documento'
              respostas = [
                tx(
                  'pede_documento_manutencao',
                  'Por gentileza, poderia me informar o seu CPF ou CNPJ? Assim já te encaminho pro setor responsável.',
                ),
              ]
            } else if (canal === 'organico') {
              novoEtapa = 'origem'
              motivo = 'respondeu_linha_pergunta_origem'
              respostas = [
                tx(
                  'pergunta_origem',
                  'Me conte, de onde você nos conheceu?\n🔹 *Pesquisei no Google*\n🔹 *Vi anúncio no Instagram/Facebook*',
                ),
              ]
            } else {
              novoEtapa = 'e2'
              motivo = 'respondeu_linha'
              respostas = [
                tx(
                  'abrindo_ampliando',
                  'Legal!😃 Você está abrindo um novo espaço ou ampliando um que já existe?',
                ),
              ]
            }
          } else if (etapaAtual === 'origem') {
            var tO = normalizar(texto)
            if (tO.indexOf('google') >= 0 || tO.indexOf('pesquisei') >= 0)
              origemDetectada = 'google'
            else if (
              tO.indexOf('instagram') >= 0 ||
              tO.indexOf('facebook') >= 0 ||
              tO.indexOf('anuncio') >= 0 ||
              tO.indexOf('insta') >= 0
            )
              origemDetectada = 'meta'
            if (origemDetectada === '') {
              motivo = 'origem_invalida'
              respostas = [
                tx(
                  'origem_invalida',
                  'Pode me dizer por onde nos conheceu?\n🔹 *Pesquisei no Google*\n🔹 *Vi anúncio no Instagram/Facebook*',
                ),
              ]
            } else {
              novoEtapa = 'e3'
              motivo = 'origem_' + origemDetectada
              respostas = [
                origemDetectada === 'google'
                  ? tx(
                      'origem_google',
                      'Legal que você veio pelo Google! 😃 Você está abrindo um novo espaço ou ampliando um que já existe?',
                    )
                  : tx(
                      'origem_meta',
                      'Legal que você veio pelo Instagram/Facebook! 😃 Você está abrindo um novo espaço ou ampliando um que já existe?',
                    ),
              ]
            }
          } else if (etapaAtual === 'e2' || etapaAtual === 'e3') {
            novoEtapa = 'e3b'
            motivo = 'abrindo_ou_ampliando'
            respostas = [
              tx(
                'cliente_ou_primeiro',
                'Perfeito! 😊 Você já é cliente Haisan ou é seu primeiro contato com a gente?',
              ),
            ]
          } else if (etapaAtual === 'e3b') {
            if (
              contem(
                texto,
                lst('ja_cliente', ['ja sou', 'sou cliente', 'cliente haisan', 'ja comprei', 'sim']),
              )
            ) {
              novoEtapa = 'e5'
              motivo = 'ja_e_cliente'
              respostas = [
                tx(
                  'pede_documento_vendas',
                  'Por gentileza, poderia me informar o seu CPF ou CNPJ? Assim já te encaminho pro setor de vendas.',
                ),
              ]
            } else {
              // ---------- CORREÇÃO 11/11 (piloto) ----------
              // ANTES: qualquer resposta que não fosse "já sou cliente"
              // TRANSFERIA na hora. O teste do 41 8436-5165 mostrou o defeito:
              // o cliente respondeu "2" (ampliando) e recebeu "o Fábio vai te
              // atender" sem nunca ter escolhido a linha de produto.
              //
              // AGORA: confirma o que ele quer antes de passar ao vendedor —
              // o "filtrar conversa" que a gestão pediu.
              novoEtapa = 'e3c'
              motivo = 'confirmar_necessidade'
              respostas = [
                tx(
                  'confirma_necessidade',
                  'Perfeito! 😊 Para eu te passar a pessoa certa, me conta: você precisa de *poltrona/cadeira*, *lavatório*, *maca*, *móvel para manicure* ou *espelho e recepção*?',
                ),
              ]
            }
          } else if (etapaAtual === 'e3c') {
            // ---------- e3c (novo, 11/11): confirma a necessidade e SÓ ENTÃO
            // transfere, com o contexto do que o cliente quer ----------
            var temNecessidade =
              contem(texto, [
                'poltrona',
                'cadeira',
                'lavatorio',
                'lavatório',
                'maca',
                'manicure',
                'espelho',
                'recepcao',
                'recepção',
                'sofa',
                'sofá',
                'banco',
                'mocho',
              ]) || String(texto).replace(/[^0-9]/g, '').length >= 1
            if (temNecessidade) {
              novoEtapa = 'e4'
              motivo = 'primeiro_contato'
              transfere = true
              respostas = [TXT_CONSULTOR, HORARIO]
            } else {
              motivo = 'necessidade_nao_entendida'
              respostas = [
                tx(
                  'necessidade_nao_entendida',
                  'Sem problema! 😊 Você quer ver *poltronas*, *lavatórios*, *macas*, *móveis de manicure* ou *recepção*? Qualquer uma dessas eu já te encaminho.',
                ),
              ]
            }
          } else if (etapaAtual === 'e5' || etapaAtual === 'manut1') {
            var digs = String(texto).replace(/[^0-9]/g, '')
            if (digs.length < 11) {
              motivo = 'documento_invalido'
              respostas = [
                tx(
                  'documento_invalido',
                  'Por favor, me informe o CPF ou CNPJ (só os números) para eu te encaminhar corretamente. 😊',
                ),
              ]
            } else if (etapaAtual === 'manut1') {
              novoEtapa = 'manut2'
              motivo = 'manutencao_transferida'
              transfere = true
              respostas = [
                tx(
                  'manutencao_ok',
                  'Aguarde alguns minutos, que irei lhe encaminhar para o setor responsável. ☺️',
                ),
                HORARIO,
              ]
            } else {
              novoEtapa = 'e6'
              motivo = 'cliente_transferido'
              transfere = true
              respostas = [
                tx(
                  'cliente_ok',
                  'Obrigado pela informação... Aguarde alguns minutos, que irei lhe encaminhar para um vendedor Haisan. ☺️',
                ),
                HORARIO,
              ]
            }
          } else {
            novoEtapa = 'menu'
            motivo = 'reinicio'
            respostas = [MENU]
          }
        }

        // ---------- MODO ENSAIO: nao toca no estado real ----------
        // Antes eu gravava a etapa mesmo em ensaio, e como a resposta nao saia
        // o cliente nunca recebia o menu — mas a etapa avancava. A conversa
        // ficava "adiantada" e a IA respondia coisa fora de contexto (03/11).
        // Em ensaio: registra o que faria, uma vez por mensagem (dedupe).
        if (MODO_ENSAIO) {
          const chaveEnsaio = 'roteiro_ensaio|' + cv.id + '|' + String(ultima.id || '')
          var jaLogado = false
          try {
            const colEvE = $app.findCollectionByNameOrId('whatsapp_eventos')
            const ex = $app.findRecordsByFilter(
              colEvE,
              "dedupe_key='" + chaveEnsaio + "'",
              '',
              1,
              0,
            )
            if (ex && ex.length > 0) jaLogado = true
          } catch (eEx) {}
          if (!jaLogado) {
            try {
              const colEvE2 = $app.findCollectionByNameOrId('whatsapp_eventos')
              const evE = new Record(colEvE2)
              evE.set('dedupe_key', chaveEnsaio)
              evE.set('evento', 'roteiro_ensaio')
              evE.set('session_id', '')
              evE.set('ref_id', cv.id)
              evE.set('resultado', motivo + ' -> ' + novoEtapa)
              evE.set('codigo_erro', 'canal=' + canal + ' | respostas=' + respostas.length)
              evE.set('trace_id', '')
              evE.set('duracao_ms', 0)
              evE.set('recebido_em', new Date().toISOString())
              evE.set('fixture', false)
              $app.save(evE)
            } catch (eEvE) {}
            console.log(
              'wa_roteiro[ENSAIO] ' +
                cv.id +
                ' | ' +
                motivo +
                ' | ' +
                etapaAtual +
                ' -> ' +
                novoEtapa +
                ' | respostas=' +
                respostas.length,
            )
          }
          continue
        }

        // ---------- grava etapa / canal ----------
        // CORREÇÃO 04/11 (bug que deixou cliente sem resposta): aqui eu marcava
        // `ultima_resposta_ia_em` ANTES de enfileirar. Se o enfileiramento
        // falhasse (ou a fila não pegasse), a conversa ficava marcada como
        // "já respondida" para sempre e o cliente NUNCA recebia. O marcador de
        // idempotência só pode ser gravado DEPOIS que a resposta entrou na fila.
        try {
          if (novoEtapa !== etapaAtual) cv.set('etapa_atual', novoEtapa)
          if (transfere) cv.set('estado', 'transferida')
          $app.save(cv)
        } catch (eSave) {}

        // origem detectada alimenta o lead (como no CRM antigo)
        if (origemDetectada !== '' && String(cv.get('lead') || '') !== '') {
          try {
            const ld = $app.findRecordById(colL, String(cv.get('lead')))
            ld.set('origem', origemDetectada)
            $app.save(ld)
          } catch (eOri) {}
        }

        // ---------- transfere: dá dono ao lead (ninguém fica sem dono) ----------
        // CA-3-43 (05/11) — UM LEAD, UM DONO. O robô NÃO escolhe dono: quem
        // decide é a carteira e, sem dono, o rodízio do ponto único
        // (`whatsapp_transferencias`). Antes ele calculava o consultor de menor
        // carga aqui e gravava; com o rodízio do `wa_aviso_lead_novo` rodando em
        // paralelo, o mesmo lead aparecia para duas vendedoras (caso de 04/11).
        // Agora: se o lead já tem dono, o robô apenas anuncia esse dono (feito
        // acima, em `cons`); se não tem, ele PEDE a atribuição ao ponto único e
        // lê o dono gravado, em vez de gravar por conta própria.
        // BUG CORRIGIDO 05/11 (caso Fabíola): o guard exigia `cons.id !== ''`,
        // mas `cons.id` vem do DONO do lead — e quando o lead NÃO tem dono o
        // campo é vazio. Resultado: a conversa virava `transferida`, o robô
        // anunciava um consultor, e o pedido ao ponto único nunca era criado.
        // O lead ficava sem dono e ninguém cobrava. Agora o pedido sai sempre
        // que a conversa transfere e o lead existe, com ou sem dono.
        if (transfere && String(cv.get('lead') || '') !== '') {
          try {
            const ld2 = $app.findRecordById(colL, String(cv.get('lead')))
            if (String(ld2.get('owner_id') || '') === '') {
              // pede ao ponto único (idempotente: se já houver pedido aberto
              // para este lead, o hook de transferência não duplica o dono)
              try {
                const colTr = $app.findCollectionByNameOrId('whatsapp_transferencias')
                const tr = new Record(colTr)
                tr.set('lead', ld2.id)
                // valores REAIS da coleção (conferidos 05/11): o motivo do
                // roteiro vira 'fora_do_roteiro' e a origem é 'ia'.
                tr.set('origem_pedido', 'ia')
                tr.set('motivo', 'fora_do_roteiro')
                tr.set('simulacao', false)
                tr.set('fixture', false)
                tr.set('detalhe', 'pedido pelo roteiro (' + motivo + ')')
                $app.save(tr)
              } catch (eTr) {}
              // lê o dono que o ponto único gravou (pode não ter rodado ainda:
              // nesse caso o lead segue sem dono e o rodízio resolve em minutos)
              var donoAgora = ''
              try {
                const relido = $app.findRecordById(colL, ld2.id)
                donoAgora = String(relido.get('owner_id') || '')
              } catch (eRl) {}
              if (donoAgora !== '') {
                try {
                  const colEvA = $app.findCollectionByNameOrId('crm_lead_events')
                  const evA = new Record(colEvA)
                  evA.set('lead_id', ld2.id)
                  evA.set('tipo', 'status')
                  evA.set('texto', 'Transferido pelo roteiro; dono definido pelo rodízio')
                  $app.save(evA)
                } catch (eEvA) {}
              }
            }
          } catch (eOwn) {}
        }
        // ---------- enfileira (so quando o envio estiver ligado) ----------
        var enfileirados = 0
        for (var k = 0; k < respostas.length; k++) {
          const txt = String(respostas[k] || '')
          if (txt === '') continue
          try {
            const env = new Record(colEnv)
            env.set('lead', String(cv.get('lead') || ''))
            env.set('conexao', central.id)
            env.set('destino_telefone', String(cv.get('contato_telefone') || ''))
            // 'ia_roteiro' NÃO existe no select `motivo` de whatsapp_envios: o
            // save é recusado, nada sai e o cliente fica parado (04/11, duas
            // vezes). 'ia_resposta' é o valor da coleção para "a IA respondeu".
            env.set('motivo', 'ia_resposta')
            env.set('modo', 'texto')
            env.set('texto', txt)
            env.set('legenda', '')
            env.set('autor_user', '')
            env.set('criado_por', '')
            env.set('estado', 'pendente')
            env.set('tentativas', 0)
            env.set('fixture', false)
            env.set('dedupe_key', 'iarot-' + cv.id + '-' + new Date().getTime() + '-' + k)
            $app.save(env)
            enfileirados++
          } catch (eEnv) {}
        }

        // só marca como respondida se realmente entrou na fila. Sem isso, uma
        // falha de enfileiramento silenciava o cliente para sempre (04/11).
        if (enfileirados > 0) {
          try {
            cv.set('ultima_resposta_ia_em', new Date().toISOString())
            $app.save(cv)
          } catch (eMarc) {}
        } else {
          console.log('wa_roteiro: NADA enfileirado para ' + cv.id + ' — nao marco como respondida')
        }
      } catch (eCv) {
        // SONDA: erro real por conversa (antes era engolido em silêncio)
        try {
          const colS2 = $app.findCollectionByNameOrId('diag_cron_sonda')
          const r2 = new Record(colS2)
          r2.set('job', 'ERRO|' + String(eCv).slice(0, 130))
          r2.set('quando', new Date().toISOString())
          $app.save(r2)
        } catch (eS2) {}
      }
    }
  } catch (eTop) {
    try {
      const colS3 = $app.findCollectionByNameOrId('diag_cron_sonda')
      const r3 = new Record(colS3)
      r3.set('job', 'ERRO_TOP|' + String(eTop).slice(0, 130))
      r3.set('quando', new Date().toISOString())
      $app.save(r3)
    } catch (eS3) {}
  }
})

// ==================== DIAGNOSTICO DO MOTOR ====================
// Mostra, para as conversas da central, por que cada uma foi ou nao atendida.
// Criado porque o cron "rodava e nada acontecia": sem visibilidade eu ficava
// adivinhando (03/11). Agora a causa aparece na hora.
routerAdd(
  'GET',
  '/backend/v1/whatsapp/roteiro/diagnostico',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    const colCx = $app.findCollectionByNameOrId('whatsapp_conexoes')
    var centrais = []
    try {
      centrais = $app.findRecordsByFilter(colCx, "papel='central' && ativo=true", '', 5, 0)
    } catch (e0) {}
    const central = centrais.length > 0 ? centrais[0] : null

    const colCv = $app.findCollectionByNameOrId('whatsapp_conversas')
    const colMsg = $app.findCollectionByNameOrId('whatsapp_mensagens')

    // A JANELA DO PAINEL MANDA (correção 04/11): o diagnóstico dizia "AGIRIA"
    // para conversas de dias atrás, e o cron — que aplica `janela_min` — não
    // respondia nenhuma. Duas visões da mesma regra: a pessoa lia "11 vão ser
    // atendidas" e nada acontecia. Agora usa a MESMA janela do cron.
    var janelaMin = 30
    try {
      const colCfgD = $app.findCollectionByNameOrId('atendimento_config')
      const vsD = $app.findRecordsByFilter(colCfgD, '', '', 500, 0)
      var cfgD = null
      for (const v of vsD) {
        if (!cfgD || Number(v.get('versao') || 0) > Number(cfgD.get('versao') || 0)) cfgD = v
      }
      if (cfgD) janelaMin = Number(cfgD.get('janela_min') || 0)
    } catch (eCfgD) {}

    var conversas = []
    try {
      conversas = $app.findRecordsByFilter(colCv, '', '', 60, 0)
    } catch (e1) {
      return e.json(200, { ok: false, erro: 'falha ao listar conversas: ' + String(e1) })
    }
    conversas.sort(function (a, b) {
      return String(b.get('ultima_mensagem_em') || '').localeCompare(
        String(a.get('ultima_mensagem_em') || ''),
      )
    })

    const itens = []
    for (const cv of conversas) {
      var ultimas = []
      var erroMsg = ''
      try {
        ultimas = $app.findRecordsByFilter(
          colMsg,
          "conexao='" +
            String(cv.get('conexao') || '') +
            "' && contato_telefone='" +
            String(cv.get('contato_telefone') || '') +
            "'",
          '',
          12,
          0,
        )
      } catch (e2) {
        erroMsg = String(e2)
      }
      ultimas.sort(function (a, b) {
        return String(b.get('created') || '').localeCompare(String(a.get('created') || ''))
      })
      const ultima = ultimas.length > 0 ? ultimas[0] : null
      // resposta nossa DEPOIS da ultima mensagem do cliente = a mais recente e saida
      const houveSaida = ultima ? String(ultima.get('direcao')) === 'saida' : false
      const est = String(cv.get('estado') || '')
      const etapa = String(cv.get('etapa_atual') || '')
      const canal = String(cv.get('canal') || '')
      var motivo = 'ok'
      if (erroMsg !== '') motivo = 'ERRO ao ler mensagens: ' + erroMsg
      else if (!central) motivo = 'sem conexao central ativa'
      else if (String(cv.get('conexao') || '') !== central.id) motivo = 'nao e da central'
      else if (est !== 'triagem') motivo = 'estado=' + est
      else if (!ultima) motivo = 'sem mensagens'
      else if (String(ultima.get('direcao')) !== 'entrada') motivo = 'ultima nao e do cliente'
      else if (houveSaida) motivo = 'ultima e nossa (aguardando cliente)'
      else if (
        String(ultima ? ultima.get('texto') || '' : '')
          .toLowerCase()
          .indexOf('auxilio') >= 0 ||
        String(ultima ? ultima.get('texto') || '' : '')
          .toLowerCase()
          .indexOf('reconstrucao') >= 0 ||
        String(ultima ? ultima.get('texto') || '' : '')
          .toLowerCase()
          .indexOf('auxílio') >= 0
      )
        motivo = 'spam (nao responde, por regra)'
      else if (
        janelaMin > 0 &&
        (function () {
          const q = new Date(String(ultima.get('created') || '')).getTime()
          return q > 0 && new Date().getTime() - q > janelaMin * 60000
        })()
      )
        motivo =
          'fora da janela de ' +
          janelaMin +
          ' min (mensagem antiga: a equipe responde pelo celular)'
      else if (etapa === '' && canal === '') {
        motivo = 'AGIRIA: definir canal (anuncio/google/organico) e mandar o menu'
      } else if (canal === 'sem_gatilho') {
        motivo = 'AGIRIA: legado sem_gatilho -> vira organico'
      } else motivo = 'AGIRIA: etapa ' + etapa + ' (canal ' + canal + ')'

      itens.push({
        id: cv.id,
        nome: String(cv.get('contato_nome') || ''),
        telefone: String(cv.get('contato_telefone') || ''),
        estado: est,
        canal: canal,
        etapa_atual: etapa,
        ultima_direcao: ultima ? String(ultima.get('direcao')) : '',
        ultima_em: String(cv.get('ultima_mensagem_em') || '').slice(0, 19),
        total_msgs: ultimas.length,
        motivo: motivo,
      })
    }
    var agiriam = 0
    for (const it of itens) if (it.motivo.indexOf('AGIRIA') === 0) agiriam++
    return e.json(200, {
      ok: true,
      central: central
        ? { id: central.id, nome: String(central.get('nome_exibicao') || '') }
        : null,
      total: itens.length,
      agiriam: agiriam,
      itens: itens,
    })
  },
  $apis.requireAuth(),
)
