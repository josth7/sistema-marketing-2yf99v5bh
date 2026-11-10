/// <reference path="../pb_data/types.d.ts" />
/**
 * MOTOR DO ROTEIRO — IA da central (30/10, v2).
 *
 * Replica os 3 agentes da Movienari (doc do dono, 22/10). Decisões de hoje:
 *  - a IA responde QUALQUER mensagem que chegue na central (ordem do dono);
 *  - a ORIGEM do lead decide o roteiro (google / meta / organico), como no
 *    agente atual, onde o gatilho do anúncio já diz de onde veio;
 *  - o consultor sorteado no rodízio entra na mensagem de transferência com
 *    nome e número reais.
 *
 * LIÇÃO JSVM (custou 2 publicações 404 hoje): `function`/`var` no TOPO do
 * arquivo QUEBRA a carga do hook inteiro — toda rota vira 404. Tudo INLINE.
 *
 * ROTAS
 *   POST /backend/v1/whatsapp/roteiro/simular        { etapa, canal, texto }
 *   POST /backend/v1/whatsapp/roteiro/simular-fluxo  { passos, canal }
 *   GET  /backend/v1/whatsapp/roteiro/consultores    → rodízio com número
 *   POST /backend/v1/whatsapp/roteiro/ligar          { ativo } → liga/desliga envio
 *
 * CRON `wa_roteiro` (1 min): conversas da central, estado triagem, cliente
 * falou por último → decide, grava etapa, enfileira (motivo ia_roteiro) ou
 * apenas registra em MODO_ENSAIO.
 */

// ==================== CONSULTORES (rodízio com número) ====================
routerAdd(
  'GET',
  '/backend/v1/whatsapp/roteiro/consultores',
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

    // vendedor = tem grant read_conversas/read_leads e NÃO é gestão (escopo '*')
    const colU = $app.findCollectionByNameOrId('users')
    const colG = $app.findCollectionByNameOrId('access_grants')
    var usuarios = []
    try {
      usuarios = $app.findRecordsByFilter(colU, '', '', 200, 0)
    } catch (e0) {
      return e.json(200, { ok: true, consultores: [] })
    }
    var vendedores = []
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
      vendedores.push({ id: u.id, nome: nome || email })
    }

    // número de cada um: conexão papel=vendedor ligada ao user
    const colCx = $app.findCollectionByNameOrId('whatsapp_conexoes')
    var conexoes = []
    try {
      conexoes = $app.findRecordsByFilter(colCx, "papel='vendedor' && ativo=true", '', 20, 0)
    } catch (e1) {}

    const consultores = []
    for (const v of vendedores) {
      var numero = ''
      var nomePublico = ''
      for (const c of conexoes) {
        if (String(c.get('vendedor_user') || '') !== v.id) continue
        numero = String(c.get('numero') || '')
        nomePublico =
          String(c.get('vendedor_nome_publico') || '') || String(c.get('nome_exibicao') || '')
      }
      // formata para leitura: 5541997213499 -> (41) 9721-3499
      var bonito = numero
      try {
        const d = numero.replace(/[^0-9]/g, '')
        if (d.length === 13) bonito = '(' + d.slice(2, 4) + ') ' + d.slice(4, 9) + '-' + d.slice(9)
        else if (d.length === 12)
          bonito = '(' + d.slice(2, 4) + ') ' + d.slice(4, 8) + '-' + d.slice(8)
      } catch (eF) {}
      consultores.push({
        id: v.id,
        nome: v.nome,
        nome_publico: nomePublico || v.nome,
        numero: numero,
        numero_bonito: bonito,
        tem_numero: numero !== '',
      })
    }
    return e.json(200, { ok: true, total: consultores.length, consultores: consultores })
  },
  $apis.requireAuth(),
)

// ==================== SIMULAR UM PASSO ====================
routerAdd(
  'POST',
  '/backend/v1/whatsapp/roteiro/simular',
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

    const LINHAS = [
      { chave: 'barbearia', termos: ['barbearia', 'barbeiro', 'barber'] },
      { chave: 'salao', termos: ['salao', 'cabeleireiro', 'cabelo'] },
      { chave: 'podologia', termos: ['podologia', 'podologo', 'estetica', 'esteta'] },
      { chave: 'manicure', termos: ['manicure', 'pedicure', 'unha'] },
      { chave: 'manutencao', termos: ['manutencao', 'consertar', 'conserto', 'quebrou', 'reparo'] },
    ]
    const ORIGENS = [
      { chave: 'google', termos: ['google', 'pesquisei'] },
      { chave: 'meta', termos: ['instagram', 'facebook', 'anuncio', 'vi o anuncio', 'insta'] },
    ]
    const SINAIS_HUMANO = [
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
    ]
    const SINAIS_ESTRESSE = [
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
    ]
    const FORA_ESCOPO = [
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
    ]
    const HORARIO =
      'Nosso horário de atendimento é de segunda a sexta, das 8:00h às 17:30h. Se você mandou essa mensagem fora desse horário, um vendedor vai te responder assim que abrir o expediente. Obrigado pela paciência! ✨'
    // menu do canal META (o gatilho do anúncio já diz a origem)
    const MENU_META =
      'Bem-vindo(a) a *Haisan*! 💎\n' +
      'Somos uma *fábrica brasileira de móveis* para salão de beleza, barbearia e clínica de estética, com *mais de 30 anos* de história.\n' +
      'Você está falando com o *assistente virtual da Haisan*. 😃\n' +
      'Para agilizar seu atendimento, pode nos dizer qual linha é do seu interesse?\n' +
      '💈 *Barbearia*\n' +
      '🪞 *Salão de Beleza*\n' +
      '🧴 *Podologia ou Estética*\n' +
      '💅 *Manicure e Pedicure*'
    // menu do canal ORGANICO/GOOGLE: com manutenção (o doc mantém nos dois)
    const MENU_ORGANICO =
      'Bem-vindo(a) a *Haisan*! 💎\n' +
      'Somos uma *fábrica brasileira de móveis* para salão de beleza, barbearia e clínica de estética, com *mais de 30 anos* de história.\n' +
      'Você está falando com o *assistente virtual da Haisan*. 😃\n' +
      'Para agilizar seu atendimento, pode nos dizer qual linha é do seu interesse?\n' +
      '💈 *Barbearia*\n' +
      '🪞 *Salão de Beleza*\n' +
      '🧴 *Podologia ou Estética*\n' +
      '💅 *Manicure e Pedicure*\n' +
      '🛠️ *Manutenção dos móveis Haisan*'

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
    function contemAlgum(texto, lista) {
      var t = normalizar(texto)
      for (var i = 0; i < lista.length; i++) {
        if (t.indexOf(normalizar(lista[i])) >= 0) return true
      }
      return false
    }

    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}
    var etapa = String(body.etapa || '')
    const texto = String(body.texto || '')
    var canal = String(body.canal || 'organico')
    if (['google', 'meta', 'organico'].indexOf(canal) < 0) canal = 'organico'
    const MENU = canal === 'meta' ? MENU_META : MENU_ORGANICO

    // ---------- consultor: o de menor carga (nome e número reais) ----------
    var consultor = { nome: '[CONSULTOR]', numero: '[NÚMERO]' }
    try {
      const colU = $app.findCollectionByNameOrId('users')
      const colGe = $app.findCollectionByNameOrId('access_grants')
      const colL0 = $app.findCollectionByNameOrId('crm_leads')
      const colCx = $app.findCollectionByNameOrId('whatsapp_conexoes')
      var us = $app.findRecordsByFilter(colU, '', '', 200, 0)
      var leads0 = $app.findRecordsByFilter(colL0, 'fixture=false', '', 6000, 0)
      var cxs = $app.findRecordsByFilter(colCx, "papel='vendedor' && ativo=true", '', 20, 0)
      const carga = {}
      for (const l0 of leads0) {
        const ow = String(l0.get('owner_id') || '')
        if (ow === '') continue
        const st0 = String(l0.get('status') || 'entrada_lead')
        if (st0 === 'venda_realizada' || st0 === 'finalizado' || st0 === 'descartado') continue
        carga[ow] = (carga[ow] || 0) + 1
      }
      var melhor = null
      var menor = -1
      for (const u of us) {
        const em = String(u.get('email') || '')
        const nm = String(u.get('name') || '')
        if (em === '' || em.toLowerCase().indexOf('fixture') >= 0) continue
        if (nm.toLowerCase().indexOf('fixture') >= 0) continue
        if (em.indexOf('josth') >= 0) continue
        var vd = false
        var gt = false
        try {
          const gs0 = $app.findRecordsByFilter(
            colGe,
            "user_id='" + u.id + "' && revoked_at=''",
            '',
            20,
            0,
          )
          for (const g0 of gs0) {
            let a0 = []
            let s0 = []
            try {
              const rA = g0.get('actions')
              a0 =
                Array.isArray(rA) && rA.length > 0 && typeof rA[0] === 'number'
                  ? JSON.parse(String.fromCharCode.apply(null, rA))
                  : typeof rA === 'string'
                    ? JSON.parse(rA)
                    : rA || []
            } catch (eA0) {}
            try {
              const rS = g0.get('scope_accounts')
              s0 =
                Array.isArray(rS) && rS.length > 0 && typeof rS[0] === 'number'
                  ? JSON.parse(String.fromCharCode.apply(null, rS))
                  : typeof rS === 'string'
                    ? JSON.parse(rS)
                    : rS || []
            } catch (eS0) {}
            if (Array.isArray(s0) && s0.indexOf('*') >= 0) gt = true
            if (a0.indexOf('read_conversas') >= 0 || a0.indexOf('read_leads') >= 0) vd = true
          }
        } catch (eG0) {}
        if (!vd || gt) continue
        const c0 = carga[u.id] || 0
        if (menor < 0 || c0 < menor) {
          menor = c0
          melhor = u
        }
      }
      if (melhor) {
        consultor.nome = String(melhor.get('name') || '')
        for (const c of cxs) {
          if (String(c.get('vendedor_user') || '') !== melhor.id) continue
          const num = String(c.get('numero') || '')
          const d = num.replace(/[^0-9]/g, '')
          if (d.length === 13)
            consultor.numero = '(' + d.slice(2, 4) + ') ' + d.slice(4, 9) + '-' + d.slice(9)
          else if (d.length === 12)
            consultor.numero = '(' + d.slice(2, 4) + ') ' + d.slice(4, 8) + '-' + d.slice(8)
        }
      }
    } catch (eCons) {}

    const TXT_TRANSFERE_CONSULTOR =
      'Certo! 😊 Já te encaminhei pro nosso time de vendas! Seu consultor será o *' +
      consultor.nome +
      '* — nos próximos minutos você recebe uma mensagem dele pelo número *' +
      consultor.numero +
      '*. Pode salvar como *Haisan Vendas*! 😊'

    // ---------- 0. humano / estresse (prioridade absoluta) ----------
    if (contemAlgum(texto, SINAIS_HUMANO)) {
      return e.json(200, {
        ok: true,
        saida: {
          etapa: 'humano',
          motivo: 'cliente_pediu_humano',
          transferir: true,
          consultor: consultor,
          respostas: [
            'Entendo! Vou te encaminhar AGORA para um dos nossos vendedores, só um momento! ☺️',
            HORARIO,
          ],
        },
      })
    }
    if (contemAlgum(texto, SINAIS_ESTRESSE)) {
      return e.json(200, {
        ok: true,
        saida: {
          etapa: 'humano',
          motivo: 'cliente_impaciente',
          transferir: true,
          consultor: consultor,
          respostas: [
            'Entendo! Vou te encaminhar AGORA para um dos nossos vendedores, só um momento! ☺️',
            HORARIO,
          ],
        },
      })
    }

    // ---------- 1. FAQ (só as 2 cadastradas) ----------
    const FAQ = [
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
    var faqA = null
    for (var f2 = 0; f2 < FAQ.length; f2++) {
      if (contemAlgum(texto, FAQ[f2].chaves)) {
        faqA = FAQ[f2]
        break
      }
    }
    if (faqA) {
      return e.json(200, {
        ok: true,
        saida: {
          etapa: etapa === '' ? 'menu' : etapa,
          motivo: 'faq',
          transferir: false,
          consultor: consultor,
          respostas: [faqA.resposta],
        },
      })
    }

    // ---------- 2. fora do escopo ----------
    if (contemAlgum(texto, FORA_ESCOPO)) {
      return e.json(200, {
        ok: true,
        saida: {
          etapa: 'humano',
          motivo: 'pergunta_fora_do_escopo',
          transferir: true,
          consultor: consultor,
          respostas: ['Vou te encaminhar para um de nossos vendedores, só um momento!', HORARIO],
        },
      })
    }

    // ---------- 3. fluxo ----------
    if (etapa === '' || etapa === 'e1') {
      return e.json(200, {
        ok: true,
        saida: {
          etapa: 'menu',
          motivo: 'boas_vindas',
          transferir: false,
          consultor: consultor,
          respostas: [MENU],
        },
      })
    }

    if (etapa === 'menu') {
      var linha = null
      for (var l = 0; l < LINHAS.length; l++) {
        if (contemAlgum(texto, LINHAS[l].termos)) {
          linha = LINHAS[l]
          break
        }
      }
      if (!linha) {
        return e.json(200, {
          ok: true,
          saida: {
            etapa: 'menu',
            motivo: 'menu_opcao_invalida',
            transferir: false,
            consultor: consultor,
            respostas: ['Desculpe, não entendi. 😊 Pode escolher uma das opções?', MENU],
          },
        })
      }
      if (linha.chave === 'manutencao') {
        return e.json(200, {
          ok: true,
          saida: {
            etapa: 'manut1',
            motivo: 'manutencao_pede_documento',
            transferir: false,
            consultor: consultor,
            linha: linha.chave,
            respostas: [
              'Por gentileza, poderia me informar o seu CPF ou CNPJ? Assim já te encaminho pro setor responsável.',
            ],
          },
        })
      }
      // ORGANICO: pergunta de origem (E2 do agente do Google/Instagram).
      // META: o gatilho do anuncio ja diz — vai direto para abrindo/ampliando.
      if (canal === 'organico') {
        return e.json(200, {
          ok: true,
          saida: {
            etapa: 'origem',
            motivo: 'respondeu_linha_pergunta_origem',
            transferir: false,
            consultor: consultor,
            linha: linha.chave,
            respostas: [
              'Me conte, de onde você nos conheceu?\n🔹 *Pesquisei no Google*\n🔹 *Vi anúncio no Instagram/Facebook*',
            ],
          },
        })
      }
      return e.json(200, {
        ok: true,
        saida: {
          etapa: 'e2',
          motivo: 'respondeu_linha',
          transferir: false,
          consultor: consultor,
          linha: linha.chave,
          respostas: ['Legal!😃 Você está abrindo um novo espaço ou ampliando um que já existe?'],
        },
      })
    }

    // E2 do organico: identifica a origem e personaliza a resposta
    if (etapa === 'origem') {
      var origemAchada = ''
      for (var o = 0; o < ORIGENS.length; o++) {
        if (contemAlgum(texto, ORIGENS[o].termos)) {
          origemAchada = ORIGENS[o].chave
          break
        }
      }
      if (origemAchada === '') {
        return e.json(200, {
          ok: true,
          saida: {
            etapa: 'origem',
            motivo: 'origem_invalida',
            transferir: false,
            consultor: consultor,
            respostas: [
              'Pode me dizer por onde nos conheceu?\n🔹 *Pesquisei no Google*\n🔹 *Vi anúncio no Instagram/Facebook*',
            ],
          },
        })
      }
      return e.json(200, {
        ok: true,
        saida: {
          etapa: 'e3',
          motivo: 'origem_' + origemAchada,
          origem: origemAchada,
          transferir: false,
          consultor: consultor,
          respostas: [
            origemAchada === 'google'
              ? 'Legal que você veio pelo Google! 😃 Você está abrindo um novo espaço ou ampliando um que já existe?'
              : 'Legal que você veio pelo Instagram/Facebook! 😃 Você está abrindo um novo espaço ou ampliando um que já existe?',
          ],
        },
      })
    }

    if (etapa === 'e2' || etapa === 'e3') {
      return e.json(200, {
        ok: true,
        saida: {
          etapa: 'e3b',
          motivo: 'abrindo_ou_ampliando',
          transferir: false,
          consultor: consultor,
          respostas: [
            'Perfeito! 😊 Você já é cliente Haisan ou é seu primeiro contato com a gente?',
          ],
        },
      })
    }

    if (etapa === 'e3b') {
      var ehCliente = contemAlgum(texto, [
        'ja sou',
        'sou cliente',
        'cliente haisan',
        'ja comprei',
        'sim',
      ])
      if (ehCliente) {
        return e.json(200, {
          ok: true,
          saida: {
            etapa: 'e5',
            motivo: 'ja_e_cliente',
            transferir: false,
            consultor: consultor,
            respostas: [
              'Por gentileza, poderia me informar o seu CPF ou CNPJ? Assim já te encaminho pro setor de vendas.',
            ],
          },
        })
      }
      // primeiro contato: transfere com o consultor do rodizio
      return e.json(200, {
        ok: true,
        saida: {
          etapa: 'e4',
          motivo: 'primeiro_contato',
          transferir: true,
          consultor: consultor,
          respostas: [TXT_TRANSFERE_CONSULTOR, HORARIO],
        },
      })
    }

    if (etapa === 'e5' || etapa === 'manut1') {
      var digitos = String(texto || '').replace(/[^0-9]/g, '')
      if (digitos.length < 11) {
        return e.json(200, {
          ok: true,
          saida: {
            etapa: etapa,
            motivo: 'documento_invalido',
            transferir: false,
            consultor: consultor,
            respostas: [
              'Por favor, me informe o CPF ou CNPJ (só os números) para eu te encaminhar corretamente. 😊',
            ],
          },
        })
      }
      if (etapa === 'manut1') {
        return e.json(200, {
          ok: true,
          saida: {
            etapa: 'manut2',
            motivo: 'manutencao_transferida',
            transferir: true,
            consultor: consultor,
            respostas: [
              'Aguarde alguns minutos, que irei lhe encaminhar para o setor responsável. ☺️',
              HORARIO,
            ],
          },
        })
      }
      return e.json(200, {
        ok: true,
        saida: {
          etapa: 'e6',
          motivo: 'cliente_transferido',
          transferir: true,
          consultor: consultor,
          respostas: [
            'Obrigado pela informação... Aguarde alguns minutos, que irei lhe encaminhar para um vendedor Haisan. ☺️',
            HORARIO,
          ],
        },
      })
    }

    return e.json(200, {
      ok: true,
      saida: {
        etapa: 'menu',
        motivo: 'reinicio',
        transferir: false,
        consultor: consultor,
        respostas: [MENU],
      },
    })
  },
  $apis.requireAuth(),
)

// ==================== SIMULAR FLUXO COMPLETO ====================
// Repete a chamada de `simular` passo a passo, dentro do próprio servidor.
// Vantagem de não duplicar a lógica: uma correção no roteiro vale para os dois.
routerAdd(
  'POST',
  '/backend/v1/whatsapp/roteiro/simular-fluxo',
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
    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}
    var passos = body.passos || []
    if (!Array.isArray(passos)) return e.json(400, { ok: false, erro: 'passos deve ser lista' })
    const canal = String(body.canal || 'meta')

    // chama a rota `simular` por HTTP interno, com o mesmo token do usuário.
    // Assim a regra do roteiro existe num lugar só (lição: lógica duplicada
    // diverge — foi o que quebrou o cron em 22/10).
    // host interno do proprio sistema (o .goskip.app publico so serve o frontend)
    const base = 'https://sistema-marketing-1f51e.shrd00.internal.goskip.dev'
    var etapa = ''
    var trilha = []
    var transferiu = false

    for (var p = 0; p < passos.length; p++) {
      const texto = String(passos[p] || '')
      const antes = etapa
      var r = null
      try {
        const resp = $http.send({
          url: base + '/backend/v1/whatsapp/roteiro/simular',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: e.request.header.get('Authorization') || '',
          },
          body: JSON.stringify({ etapa: etapa, texto: texto, canal: canal }),
          timeout: 20,
        })
        var corpo = resp.body
        if (Array.isArray(corpo)) corpo = String.fromCharCode.apply(null, corpo)
        const D = JSON.parse(String(corpo))
        r = D.saida
      } catch (eS) {
        r = {
          etapa: etapa,
          motivo: 'erro_simulacao',
          transferir: false,
          respostas: ['erro: ' + String(eS)],
        }
      }
      if (!r) {
        r = { etapa: etapa, motivo: 'sem_resposta', transferir: false, respostas: [] }
      }
      trilha.push({
        recebido: texto,
        etapa_antes: antes,
        etapa_depois: String(r.etapa || ''),
        motivo: String(r.motivo || ''),
        transferir: r.transferir === true,
        respostas: r.respostas || [],
      })
      etapa = String(r.etapa || '')
      if (r.transferir === true) {
        transferiu = true
        break
      }
    }
    return e.json(200, {
      ok: true,
      trilha: trilha,
      etapa_final: etapa,
      transferiu: transferiu,
      canal: canal,
    })
  },
  $apis.requireAuth(),
)
