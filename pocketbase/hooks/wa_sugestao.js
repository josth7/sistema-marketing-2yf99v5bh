/// <reference path="../pb_data/types.d.ts" />
/**
 * SUGESTÃO DE RESPOSTA — a IA escreve, o vendedor envia pelo celular (03/11).
 *
 * Por que existe: a Meta bloqueia o envio pela API (130497), então a IA não
 * consegue entregar. Mas ela pode PENSAR: este arquivo gera a resposta certa
 * para a conversa, o vendedor copia e manda pelo WhatsApp do celular.
 *
 * São duas coisas:
 *
 *   1. GET /backend/v1/whatsapp/conversas/{id}/sugestao
 *      → lê a conversa e devolve o texto que o roteiro manda responder agora
 *        (usa a mesma lógica de etapas do motor, sem depender de LLM)
 *
 *   2. GET /backend/v1/whatsapp/fila-sugestoes
 *      → a lista de TODAS as conversas esperando resposta, com a sugestão
 *        de cada uma pronta. É a fila de trabalho do vendedor.
 *
 * Por que regra e não modelo de linguagem: o roteiro é rígido (o dono pediu
 * isso), e uma resposta determinística não inventa preço nem promete prazo.
 * Se um dia quiser texto livre, é só trocar a função — a rota não muda.
 *
 * JSVM: helpers INLINE (função no topo quebra o arquivo inteiro).
 */

// ==================== SUGESTÃO DE UMA CONVERSA ====================
routerAdd(
  'GET',
  '/backend/v1/whatsapp/conversas/{id}/sugestao',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    const idConv = String(e.request.pathValue('id') || '')
    if (idConv === '') return e.json(400, { ok: false, erro: 'conversa não informada' })

    var cv = null
    try {
      cv = $app.findRecordById('whatsapp_conversas', idConv)
    } catch (e0) {
      return e.json(404, { ok: false, erro: 'conversa não encontrada' })
    }

    // ---------- mensagens (vinculo por conexao + telefone) ----------
    var msgs = []
    try {
      msgs = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_mensagens'),
        "conexao='" +
          String(cv.get('conexao') || '') +
          "' && contato_telefone='" +
          String(cv.get('contato_telefone') || '') +
          "'",
        '',
        30,
        0,
      )
    } catch (e1) {}
    msgs.sort(function (a, b) {
      return String(b.get('created') || '').localeCompare(String(a.get('created') || ''))
    })

    const ultima = msgs.length > 0 ? msgs[0] : null
    const texto = ultima ? String(ultima.get('texto') || '') : ''
    const etapa = String(cv.get('etapa_atual') || '')
    var canal = String(cv.get('canal') || '')
    if (canal === '' || canal === 'sem_gatilho') canal = 'organico'

    // ---------- normalizacao ----------
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
    function contem(t, lista) {
      const n = normalizar(t)
      for (var i = 0; i < lista.length; i++) {
        if (n.indexOf(normalizar(lista[i])) >= 0) return true
      }
      return false
    }

    const MENU_META =
      'Bem-vindo(a) a *Haisan*! 💎\n' +
      'Somos uma *fábrica brasileira de móveis* para salão de beleza, barbearia e clínica de estética, com *mais de 30 anos* de história.\n' +
      'Você está falando com o *assistente virtual da Haisan*. 😃\n' +
      'Para agilizar seu atendimento, pode nos dizer qual linha é do seu interesse?\n' +
      '💈 *Barbearia*\n🪞 *Salão de Beleza*\n🧴 *Podologia ou Estética*\n💅 *Manicure e Pedicure*'
    const MENU_ORGANICO = MENU_META + '\n🛠️ *Manutenção dos móveis Haisan*'
    const HORARIO =
      'Nosso horário de atendimento é de segunda a sexta, das 8:00h às 17:30h. Se você mandou essa mensagem fora desse horário, um vendedor vai te responder assim que abrir o expediente. Obrigado pela paciência! ✨'

    // Ja houve resposta NOSSA nesta conversa? Se nunca houve, a proxima
    // mensagem e o MENU, nao importa o que a etapa diga — a etapa pode ter
    // sido adiantada pelo ensaio (medido em 03/11: Franzinha aparecia em
    // `menu` e a sugestao respondia "nao entendi" sem nunca ter falado nada).
    var houveSaida = false
    for (var i2 = 0; i2 < msgs.length; i2++) {
      if (String(msgs[i2].get('direcao')) === 'saida') houveSaida = true
    }
    var etapaReal = etapa
    if (!houveSaida) etapaReal = ''

    var sugestao = ''
    var motivo = ''
    var transferir = false

    // ---------- consultor do rodizio (nome + numero) ----------
    var consultorNome = 'nosso time de vendas'
    var consultorNum = ''
    try {
      const colU = $app.findCollectionByNameOrId('users')
      const colGe = $app.findCollectionByNameOrId('access_grants')
      const colL = $app.findCollectionByNameOrId('crm_leads')
      const colCx = $app.findCollectionByNameOrId('whatsapp_conexoes')
      const us = $app.findRecordsByFilter(colU, '', '', 200, 0)
      const leads = $app.findRecordsByFilter(colL, 'fixture=false', '', 6000, 0)
      const cxs = $app.findRecordsByFilter(colCx, "papel='vendedor' && ativo=true", '', 20, 0)
      const carga = {}
      for (const l of leads) {
        const ow = String(l.get('owner_id') || '')
        if (ow === '') continue
        const st = String(l.get('status') || 'entrada_lead')
        if (st === 'venda_realizada' || st === 'finalizado' || st === 'descartado') continue
        carga[ow] = (carga[ow] || 0) + 1
      }
      // se o lead ja tem dono, usa ele; senao, o de menor carga
      var escolhido = ''
      const idLead = String(cv.get('lead') || '')
      if (idLead !== '') {
        try {
          const ld = $app.findRecordById(colL, idLead)
          escolhido = String(ld.get('owner_id') || '')
        } catch (eL) {}
      }
      if (escolhido === '') {
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
          const c0 = carga[u.id] || 0
          if (menor < 0 || c0 < menor) {
            menor = c0
            escolhido = u.id
          }
        }
      }
      if (escolhido !== '') {
        try {
          const ur = $app.findRecordById(colU, escolhido)
          consultorNome = String(ur.get('name') || consultorNome)
        } catch (eU2) {}
        for (const c of cxs) {
          if (String(c.get('vendedor_user') || '') !== escolhido) continue
          const nd = String(c.get('numero') || '').replace(/[^0-9]/g, '')
          if (nd.length === 13)
            consultorNum = '(' + nd.slice(2, 4) + ') ' + nd.slice(4, 9) + '-' + nd.slice(9)
          else if (nd.length === 12)
            consultorNum = '(' + nd.slice(2, 4) + ') ' + nd.slice(4, 8) + '-' + nd.slice(8)
        }
      }
    } catch (eCons) {}

    // ---------- decide a resposta ----------
    // prioridade: humano/estresse > FAQ > fora de escopo > etapa do roteiro
    if (
      contem(texto, [
        'atendente',
        'humano',
        'pessoa de verdade',
        'falar com alguem',
        'vendedor',
        'vendedora',
        'quero falar',
        'me liga',
      ])
    ) {
      sugestao =
        'Entendo! Vou te encaminhar AGORA para um dos nossos vendedores, só um momento! ☺️\n\n' +
        HORARIO
      motivo = 'cliente_pediu_humano'
      transferir = true
    } else if (
      contem(texto, [
        'pessimo',
        'horrivel',
        'absurdo',
        'ridiculo',
        'ninguem responde',
        'ja pedi',
        'urgente',
        'procon',
        'reclamacao',
      ])
    ) {
      sugestao =
        'Entendo! Vou te encaminhar AGORA para um dos nossos vendedores, só um momento! ☺️\n\n' +
        HORARIO
      motivo = 'cliente_impaciente'
      transferir = true
    } else if (contem(texto, ['prazo', 'quanto tempo', 'demora', 'producao'])) {
      sugestao =
        'O nosso prazo de produção é de 30 dias corridos. Mas também o prazo de transporte que deve ser confirmado com o nosso time de vendas.'
      motivo = 'faq_prazo'
    } else if (
      contem(texto, ['endereco', 'onde fica', 'onde voces ficam', 'localizacao', 'showroom'])
    ) {
      sugestao =
        'Estamos na Rua Kival Fernando Pereira, 125, Centro, São José dos Pinhais – PR. Temos fábrica e showroom no mesmo endereço.'
      motivo = 'faq_endereco'
    } else if (
      contem(texto, [
        'preco',
        'valor',
        'quanto custa',
        'quanto e',
        'orcamento',
        'frete',
        'pagamento',
        'parcela',
        'desconto',
        'estoque',
      ])
    ) {
      sugestao = 'Vou te encaminhar para um de nossos vendedores, só um momento!\n\n' + HORARIO
      motivo = 'pergunta_fora_do_escopo'
      transferir = true
    } else if (etapaReal === '') {
      sugestao = canal === 'meta' ? MENU_META : MENU_ORGANICO
      motivo = 'boas_vindas'
    } else if (etapaReal === 'menu') {
      sugestao =
        'Desculpe, não entendi. 😊 Pode escolher uma das opções?\n\n' +
        (canal === 'meta' ? MENU_META : MENU_ORGANICO)
      motivo = 'menu_opcao_invalida'
    } else if (etapaReal === 'origem') {
      sugestao =
        'Pode me dizer por onde nos conheceu?\n🔹 *Pesquisei no Google*\n🔹 *Vi anúncio no Instagram/Facebook*'
      motivo = 'pergunta_origem'
    } else if (etapaReal === 'e2' || etapaReal === 'e3') {
      sugestao = 'Legal!😃 Você está abrindo um novo espaço ou ampliando um que já existe?'
      motivo = 'abrindo_ou_ampliando'
    } else if (etapaReal === 'e3b') {
      sugestao = 'Perfeito! 😊 Você já é cliente Haisan ou é seu primeiro contato com a gente?'
      motivo = 'ja_cliente_ou_novo'
    } else if (etapaReal === 'e5' || etapaReal === 'manut1') {
      sugestao =
        'Por gentileza, poderia me informar o seu CPF ou CNPJ? Assim já te encaminho pro setor responsável.'
      motivo = 'pede_documento'
    } else if (
      etapaReal === 'e4' ||
      etapaReal === 'e6' ||
      etapaReal === 'manut2' ||
      etapaReal === 'humano'
    ) {
      sugestao =
        'Certo! 😊 Já te encaminhei pro nosso time de vendas! Seu consultor será o *' +
        consultorNome +
        '*' +
        (consultorNum !== ''
          ? ' — nos próximos minutos você recebe uma mensagem dele pelo número *' +
            consultorNum +
            '*'
          : '') +
        '. Pode salvar como *Haisan Vendas*! 😊\n\n' +
        HORARIO
      motivo = 'transferencia'
      transferir = true
    } else {
      sugestao = canal === 'meta' ? MENU_META : MENU_ORGANICO
      motivo = 'reinicio'
    }

    return e.json(200, {
      ok: true,
      conversa: idConv,
      contato_nome: String(cv.get('contato_nome') || ''),
      contato_telefone: String(cv.get('contato_telefone') || ''),
      etapa: etapa,
      canal: canal,
      ultima_mensagem: texto.slice(0, 500),
      ultima_em: ultima ? String(ultima.get('created') || '') : '',
      sugestao: sugestao,
      motivo: motivo,
      transferir: transferir,
      consultor: { nome: consultorNome, numero: consultorNum },
    })
  },
  $apis.requireAuth(),
)

// ==================== FILA DE SUGESTÕES (trabalho do vendedor) ====================
routerAdd(
  'GET',
  '/backend/v1/whatsapp/fila-sugestoes',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    const colCv = $app.findCollectionByNameOrId('whatsapp_conversas')
    const colMsg = $app.findCollectionByNameOrId('whatsapp_mensagens')

    // escopo: gestão (escopo '*') vê tudo; vendedor vê o que é dele
    var temTudo = false
    try {
      const gs = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        50,
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
        if (a.indexOf('read_conversas') < 0 && a.indexOf('read_leads') < 0) continue
        if (Array.isArray(sc) && sc.indexOf('*') >= 0) temTudo = true
      }
    } catch (eG) {}

    // conexões que esse usuário enxerga
    var minhasConexoes = []
    try {
      const cxs = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_conexoes'),
        '',
        '',
        50,
        0,
      )
      for (const c of cxs) {
        if (temTudo) minhasConexoes.push(c.id)
        else if (String(c.get('vendedor_user') || '') === e.auth.id) minhasConexoes.push(c.id)
      }
    } catch (eCx) {}
    if (!temTudo && minhasConexoes.length === 0) {
      return e.json(200, { ok: true, total: 0, itens: [] })
    }

    var conversas = []
    try {
      conversas = $app.findRecordsByFilter(colCv, 'fixture=false', '', 500, 0)
    } catch (e0) {
      return e.json(200, { ok: true, total: 0, itens: [] })
    }

    const itens = []
    for (const cv of conversas) {
      // escopo
      if (
        minhasConexoes.indexOf(cv.id) < 0 &&
        minhasConexoes.indexOf(String(cv.get('conexao') || '')) < 0
      )
        continue

      // última mensagem do cliente?
      var msgs = []
      try {
        msgs = $app.findRecordsByFilter(
          colMsg,
          "conexao='" +
            String(cv.get('conexao') || '') +
            "' && contato_telefone='" +
            String(cv.get('contato_telefone') || '') +
            "'",
          '',
          6,
          0,
        )
      } catch (e1) {
        continue
      }
      msgs.sort(function (a, b) {
        return String(b.get('created') || '').localeCompare(String(a.get('created') || ''))
      })
      if (msgs.length === 0) continue
      if (String(msgs[0].get('direcao')) !== 'entrada') continue

      // já respondida por IA? nao
      itens.push({
        id: cv.id,
        contato_nome: String(cv.get('contato_nome') || ''),
        contato_telefone: String(cv.get('contato_telefone') || ''),
        estado: String(cv.get('estado') || ''),
        canal: String(cv.get('canal') || ''),
        etapa_atual: String(cv.get('etapa_atual') || ''),
        ultima_previa: String(cv.get('ultima_previa') || ''),
        ultima_mensagem_em: String(cv.get('ultima_mensagem_em') || ''),
        lead: String(cv.get('lead') || ''),
      })
    }
    // mais antiga primeiro: quem espera há mais tempo é atendido primeiro
    itens.sort(function (a, b) {
      return String(a.ultima_mensagem_em).localeCompare(String(b.ultima_mensagem_em))
    })
    return e.json(200, { ok: true, total: itens.length, itens: itens })
  },
  $apis.requireAuth(),
)
