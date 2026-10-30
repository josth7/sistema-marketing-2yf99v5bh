/// <reference path="../pb_data/types.d.ts" />
/**
 * MOTOR DO ROTEIRO DE ATENDIMENTO — IA da central (30/10).
 *
 * Replica o agente da Movienari, cuja configuração o dono passou em 22/10
 * (artifacts/agente-atendimento-haisan.md). O roteiro é RÍGIDO: a IA não
 * conversa livre, só conduz as etapas e responde o FAQ. Fora disso, transfere.
 *
 * REGRAS INEGOCIÁVEIS (do documento):
 *  - Só responde o roteiro e o FAQ. NUNCA preço, valor, orçamento, prazo,
 *    frete, forma de pagamento ou disponibilidade de produto.
 *  - Proibido "vou verificar e te retorno" / promessa de resposta futura.
 *  - Fora do roteiro/FAQ: "Vou te encaminhar para um de nossos vendedores,
 *    só um momento!" — direto, sem amenizar.
 *  - Uma pergunta por mensagem.
 *  - Cliente estressado/impaciente/pedindo humano: transfere IMEDIATAMENTE,
 *    e isso tem prioridade sobre o roteiro.
 *
 * ETAPAS (guardadas em whatsapp_conversas.etapa_atual):
 *  e1 → menu de linha        e2 → abrindo/ampliando
 *  e3 → já é cliente?        e4 → primeiro contato (transfere + consultor)
 *  e5 → pede CPF/CNPJ        e6 → informou documento (transfere)
 *  manut1 → pede CPF/CNPJ    manut2 → transfere setor responsável
 *  humano → transferido
 *
 * QUEM RECEBE: só a conversa da conexão `central` (decisão do dono: a IA
 * responde só na central), em estado `triagem`, e nunca quando um humano
 * já respondeu (pausada_humano).
 *
 * MODO_ENSAIO: quando true, o motor decide e REGISTRA a resposta, mas não
 * enfileira envio. Serve para provar o roteiro sem gastar envio nem arriscar
 * reputação do número enquanto a Meta estiver bloqueando (130497).
 */

var MODO_ENSAIO = true

// ---------- catálogo de linhas (menu) ----------
var LINHAS = [
  { chave: 'barbearia', rotulo: 'Barbearia', termos: ['barbearia', 'barbeiro', 'barber'] },
  {
    chave: 'salao',
    rotulo: 'Salão de Beleza',
    termos: ['salão', 'salao', 'cabeleireiro', 'cabelo'],
  },
  {
    chave: 'podologia',
    rotulo: 'Podologia ou Estética',
    termos: ['podologia', 'podologo', 'podólogo', 'estética', 'estetica', 'esteta'],
  },
  { chave: 'manicure', rotulo: 'Manicure e Pedicure', termos: ['manicure', 'pedicure', 'unha'] },
  {
    chave: 'manutencao',
    rotulo: 'Manutenção dos móveis Haisan',
    termos: ['manutenção', 'manutencao', 'consertar', 'conserto', 'quebrou', 'reparo'],
  },
]

// ---------- sinais de estresse / pedido de humano ----------
var SINAIS_HUMANO = [
  'atendente',
  'humano',
  'pessoa de verdade',
  'alguém de verdade',
  'alguem de verdade',
  'falar com alguém',
  'falar com alguem',
  'falar com uma pessoa',
  'vendedor',
  'vendedora',
  'quero falar',
  'me liga',
  'telefone de contato',
  'saco',
  'robô',
  'robo',
  'bot',
]

var SINAIS_ESTRESSE = [
  'péssimo',
  'pessimo',
  'horrível',
  'horrivel',
  'absurdo',
  'ridículo',
  'ridiculo',
  'ninguém responde',
  'ninguem responde',
  'já pedi',
  'ja pedi',
  'de novo',
  'urgente',
  'procon',
  'processo',
  'reclamação',
  'reclamacao',
]

// ---------- FAQ (2 perguntas cadastradas, endereço CORRIGIDO) ----------
var FAQ = [
  {
    chaves: ['prazo', 'quanto tempo', 'demora', 'produção', 'producao', 'entrega'],
    resposta:
      'O nosso prazo de produção é de 30 dias corridos. Mas também o prazo de transporte que deve ser confirmado com o nosso time de vendas.',
  },
  {
    chaves: [
      'endereço',
      'endereco',
      'onde fica',
      'onde vocês ficam',
      'onde voces ficam',
      'localização',
      'localizacao',
      'showroom',
    ],
    resposta:
      'Estamos na Rua Kival Fernando Pereira, 125, Centro, São José dos Pinhais – PR. Temos fábrica e showroom no mesmo endereço.',
  },
]

var HORARIO =
  'Nosso horário de atendimento é de segunda a sexta, das 8:00h às 17:30h. Se você mandou essa mensagem fora desse horário, um vendedor vai te responder assim que abrir o expediente. Obrigado pela paciência! ✨'

var MENU =
  'Bem-vindo(a) a *Haisan*! 💎\n' +
  'Somos uma *fábrica brasileira de móveis* para salão de beleza, barbearia e clínica de estética, com *mais de 30 anos* de história.\n' +
  'Você está falando com o *assistente virtual da Haisan*. 😃\n' +
  'Para agilizar seu atendimento, pode nos dizer qual linha é do seu interesse?\n' +
  '💈 *Barbearia*\n' +
  '🪞 *Salão de Beleza*\n' +
  '🧴 *Podologia ou Estética*\n' +
  '💅 *Manicure e Pedicure*\n' +
  '🛠️ *Manutenção dos móveis Haisan*'

// normaliza texto: minúsculo, sem acento (comparação tolerante)
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

function acharLinha(texto) {
  var t = normalizar(texto)
  for (var i = 0; i < LINHAS.length; i++) {
    var L = LINHAS[i]
    for (var j = 0; j < L.termos.length; j++) {
      if (t.indexOf(normalizar(L.termos[j])) >= 0) return L
    }
  }
  return null
}

function acharFaq(texto) {
  var t = normalizar(texto)
  for (var i = 0; i < FAQ.length; i++) {
    for (var j = 0; j < FAQ[i].chaves.length; j++) {
      if (t.indexOf(normalizar(FAQ[i].chaves[j])) >= 0) return FAQ[i]
    }
  }
  return null
}

/**
 * Decide a próxima ação.
 * Entrada: etapa atual, texto do cliente.
 * Saída: { etapa, respostas: [..], transferir: bool, motivo: string, linha }
 */
function decidir(etapaAtual, texto) {
  var etapa = String(etapaAtual || '')
  var t = normalizar(texto)

  // ---------- 0. prioridade absoluta: humano / estresse ----------
  if (contemAlgum(texto, SINAIS_HUMANO)) {
    return {
      etapa: 'humano',
      respostas: [
        'Entendo! Vou te encaminhar AGORA para um dos nossos vendedores, só um momento! ☺️',
        HORARIO,
      ],
      transferir: true,
      motivo: 'cliente_pediu_humano',
    }
  }
  if (contemAlgum(texto, SINAIS_ESTRESSE)) {
    return {
      etapa: 'humano',
      respostas: [
        'Entendo! Vou te encaminhar AGORA para um dos nossos vendedores, só um momento! ☺️',
        HORARIO,
      ],
      transferir: true,
      motivo: 'cliente_impaciente',
    }
  }

  // ---------- 1. FAQ a qualquer momento (só as 2 perguntas cadastradas) ----------
  var faq = acharFaq(texto)
  if (faq) {
    return {
      etapa: etapa === '' ? 'e1' : etapa,
      respostas: [faq.resposta],
      transferir: false,
      motivo: 'faq',
      soResposta: true,
    }
  }

  // ---------- 2. pergunta fora do escopo: preço, prazo, pagamento, produto ----------
  var foraEscopo = [
    'preço',
    'preco',
    'valor',
    'quanto custa',
    'quanto é',
    'quanto e',
    'orçamento',
    'orcamento',
    'frete',
    'pagamento',
    'parcela',
    'desconto',
    'disponível',
    'disponivel',
    'tem pronto',
    'estoque',
  ]
  if (contemAlgum(texto, foraEscopo)) {
    return {
      etapa: 'humano',
      respostas: ['Vou te encaminhar para um de nossos vendedores, só um momento!', HORARIO],
      transferir: true,
      motivo: 'pergunta_fora_do_escopo',
    }
  }

  // ---------- 3. fluxo por etapa ----------
  // primeira mensagem: manda o menu e passa a esperar a escolha da linha
  if (etapa === '' || etapa === 'e1') {
    return {
      etapa: 'menu',
      respostas: [MENU],
      transferir: false,
      motivo: 'boas_vindas',
    }
  }

  if (etapa === 'menu') {
    var linha = acharLinha(texto)
    if (!linha) {
      return {
        etapa: 'menu',
        respostas: ['Desculpe, não entendi. 😊 Pode escolher uma das opções?', MENU],
        transferir: false,
        motivo: 'menu_opcao_invalida',
      }
    }
    if (linha.chave === 'manutencao') {
      return {
        etapa: 'manut1',
        respostas: [
          'Por gentileza, poderia me informar o seu CPF ou CNPJ? Assim já te encaminho pro setor responsável.',
        ],
        transferir: false,
        motivo: 'manutencao_pede_documento',
        linha: linha.chave,
      }
    }
    return {
      etapa: 'e2',
      respostas: [
        'Legal!😃 Antes de te encaminhar para a nossa equipe comercial, gostaria fazer algumas perguntas para personalizar o seu atendimento.\nVai ser bem rapidinho, prometo. 😄\nVocê está *abrindo* um novo espaço ou *ampliando* um que já existe?',
      ],
      transferir: false,
      motivo: 'respondeu_linha',
      linha: linha.chave,
    }
  }

  if (etapa === 'e2') {
    return {
      etapa: 'e3',
      respostas: ['Perfeito! 😊 Você já é cliente Haisan ou é seu primeiro contato com a gente?'],
      transferir: false,
      motivo: 'abrindo_ou_ampliando',
    }
  }

  if (etapa === 'e3') {
    // "já sou cliente" → pede documento; senão → primeiro contato (transfere)
    var ehCliente = contemAlgum(texto, [
      'já sou',
      'ja sou',
      'sou cliente',
      'cliente haisan',
      'sim',
      'já comprei',
      'ja comprei',
    ])
    if (ehCliente) {
      return {
        etapa: 'e5',
        respostas: [
          'Por gentileza, poderia me informar o seu CPF ou CNPJ? Assim já te encaminho pro setor de vendas.',
        ],
        transferir: false,
        motivo: 'ja_e_cliente',
      }
    }
    return {
      etapa: 'e4',
      respostas: [], // preenchido com o consultor na hora
      transferir: true,
      motivo: 'primeiro_contato',
    }
  }

  if (etapa === 'e5' || etapa === 'manut1') {
    // espera CPF/CNPJ: 11 ou 14 dígitos
    var digitos = String(texto || '').replace(/[^0-9]/g, '')
    if (digitos.length < 11) {
      return {
        etapa: etapa,
        respostas: [
          'Por favor, me informe o CPF ou CNPJ (só os números) para eu te encaminhar corretamente. 😊',
        ],
        transferir: false,
        motivo: 'documento_invalido',
      }
    }
    if (etapa === 'manut1') {
      return {
        etapa: 'manut2',
        respostas: [
          'Aguarde alguns minutos, que irei lhe encaminhar para o setor responsável. ☺️',
          HORARIO,
        ],
        transferir: true,
        motivo: 'manutencao_transferida',
      }
    }
    return {
      etapa: 'e6',
      respostas: [
        'Obrigado pela informação... Aguarde alguns minutos, que irei lhe encaminhar para um vendedor Haisan. ☺️',
        HORARIO,
      ],
      transferir: true,
      motivo: 'cliente_transferido',
    }
  }

  // etapa final/desconhecida: volta ao menu
  return { etapa: 'menu', respostas: [MENU], transferir: false, motivo: 'reinicio' }
}

// ==================== rota de SIMULAÇÃO (prova o roteiro sem enviar) ====================
routerAdd(
  'POST',
  '/backend/v1/whatsapp/roteiro/simular',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {
      return e.json(400, { ok: false, erro: 'corpo inválido' })
    }
    var etapa = String(body.etapa || '')
    var texto = String(body.texto || '')
    var r = decidir(etapa, texto)

    // se for primeiro contato, mostra como a mensagem sai com o consultor
    if (r.motivo === 'primeiro_contato') {
      r.respostas = [
        'Certo! 😊 Já te encaminhei pro nosso time de vendas! Seu consultor será o *[CONSULTOR]* — nos próximos minutos você recebe uma mensagem dele pelo número *[NÚMERO]*. Pode salvar como *Haisan Vendas*! 😊',
        HORARIO,
      ]
    }
    return e.json(200, {
      ok: true,
      entrada: { etapa: etapa, texto: texto },
      saida: r,
      modo_ensaio: MODO_ENSAIO,
    })
  },
  $apis.requireAuth(),
)

// ==================== rota de TESTE do fluxo completo ====================
routerAdd(
  'POST',
  '/backend/v1/whatsapp/roteiro/simular-fluxo',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {
      return e.json(400, { ok: false, erro: 'corpo inválido' })
    }
    var passos = body.passos || []
    if (!Array.isArray(passos)) return e.json(400, { ok: false, erro: 'passos deve ser lista' })

    var etapa = ''
    var trilha = []
    for (var i = 0; i < passos.length; i++) {
      var r = decidir(etapa, String(passos[i]))
      var respostas = r.respostas
      if (r.motivo === 'primeiro_contato') {
        respostas = [
          'Certo! 😊 Já te encaminhei pro nosso time de vendas! Seu consultor será o *[CONSULTOR]* — nos próximos minutos você recebe uma mensagem dele pelo número *[NÚMERO]*. Pode salvar como *Haisan Vendas*! 😊',
          HORARIO,
        ]
      }
      trilha.push({
        recebido: String(passos[i]),
        etapa_antes: etapa,
        etapa_depois: r.etapa,
        motivo: r.motivo,
        transferir: r.transferir,
        respostas: respostas,
      })
      etapa = r.etapa
      if (r.transferir) break
    }
    return e.json(200, { ok: true, trilha: trilha, etapa_final: etapa })
  },
  $apis.requireAuth(),
)

// ==================== processamento real (cron) ====================
/**
 * A cada minuto: pega conversas da CENTRAL em `triagem` onde a última
 * mensagem é do cliente e ainda não houve resposta nossa, decide a etapa e
 * grava a resposta na fila de envio (motivo `ia_roteiro`).
 *
 * Não mexe no webhook (que já está validado) — o motor lê o estado do banco.
 */
cronAdd('wa_roteiro', '* * * * *', () => {
  try {
    // só a conexão central responde com IA (decisão do dono)
    const colCx = $app.findCollectionByNameOrId('whatsapp_conexoes')
    var centrais = []
    try {
      centrais = $app.findRecordsByFilter(colCx, "papel='central' && ativo=true", '', 5, 0)
    } catch (e0) {
      return
    }
    if (centrais.length === 0) return
    const central = centrais[0]

    const colCv = $app.findCollectionByNameOrId('whatsapp_conversas')
    var conversas = []
    try {
      conversas = $app.findRecordsByFilter(
        colCv,
        "conexao='" + central.id + "' && estado='triagem' && fixture=false",
        '',
        40,
        0,
      )
    } catch (e1) {
      return
    }

    const colMsg = $app.findCollectionByNameOrId('whatsapp_mensagens')
    const colEnv = $app.findCollectionByNameOrId('whatsapp_envios')

    for (const cv of conversas) {
      try {
        // última mensagem da conversa
        var ultimas = []
        try {
          ultimas = $app.findRecordsByFilter(colMsg, "conversa='" + cv.id + "'", '-created', 6, 0)
        } catch (e2) {
          continue
        }
        if (ultimas.length === 0) continue
        const ultima = ultimas[0]
        // só age quando o CLIENTE falou por último
        if (String(ultima.get('autor')) !== 'cliente') continue

        // se já existe resposta nossa depois dela, não duplica
        var jaRespondida = false
        for (var i = 0; i < ultimas.length; i++) {
          if (String(ultimas[i].get('direcao')) === 'saida') {
            jaRespondida = true
            break
          }
        }
        if (jaRespondida) continue

        var texto = String(ultima.get('texto') || '')
        if (texto === '' && String(ultima.get('tipo') || '') !== 'text') {
          // mídia sem texto: pede texto ao cliente em vez de adivinhar
          texto = ''
        }

        const r = decidir(String(cv.get('etapa_atual') || ''), texto)

        // grava a etapa nova
        if (r.etapa !== String(cv.get('etapa_atual') || '')) {
          cv.set('etapa_atual', r.etapa)
          cv.set('ia_nota', Number(cv.get('ia_nota') || 0))
          $app.save(cv)
        }

        if (r.transferir) {
          cv.set('estado', 'transferida')
          $app.save(cv)
        }

        // enfileira as respostas (uma por mensagem, como no CRM antigo)
        for (var k = 0; k < r.respostas.length; k++) {
          const txt = String(r.respostas[k] || '')
          if (txt === '') continue
          if (MODO_ENSAIO) continue // ensaio: decide mas não envia
          const env = new Record(colEnv)
          env.set('lead', String(cv.get('lead') || ''))
          env.set('conexao', central.id)
          env.set('destino_telefone', String(cv.get('contato_telefone') || ''))
          env.set('motivo', 'ia_roteiro')
          env.set('modo', 'texto')
          env.set('texto', txt)
          env.set('legenda', '')
          env.set('autor_user', '')
          env.set('criado_por', '')
          env.set('estado', 'pendente')
          env.set('tentativas', 0)
          env.set('fixture', false)
          // dedupe_key tem UNIQUE — chave por envio
          env.set('dedupe_key', 'iarot-' + cv.id + '-' + new Date().getTime() + '-' + k)
          $app.save(env)
        }
      } catch (eCv) {}
    }
  } catch (eTop) {}
})
