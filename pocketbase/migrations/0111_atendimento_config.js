/// <reference path="../pb_data/types.d.ts" />
// ===================================================================
// MIG 0111 — GOVERNANÇA DO ATENDIMENTO AUTOMÁTICO (04/11).
//
// Cria `atendimento_config` (nome da SPEC-3-005): cada mudança feita na tela
// Atendimento vira uma VERSÃO nova; o robô usa a de maior número. Guarda:
// ligado/desligado, horário de funcionamento (dias e horas, Brasília), janela
// em minutos, textos das etapas, FAQ e listas de palavras.
//
// A versão 1 nasce com os textos e regras que o robô usa desde 04/11 (os do
// agente antigo da agência), ligada e sem restrição de horário — ou seja,
// nada muda no comportamento até a gestão editar.
//
// Sem regra de API (list/view/create/update/delete = null): só as rotas
// /backend/v1/atendimento/* leem e gravam, com a permissão manage_atendimento.
// ===================================================================
migrate(
  (app) => {
    var col = null
    try {
      col = app.findCollectionByNameOrId('atendimento_config')
    } catch (e0) {}
    if (!col) {
      col = new Collection({
        name: 'atendimento_config',
        type: 'base',
        listRule: null,
        viewRule: null,
        createRule: null,
        updateRule: null,
        deleteRule: null,
        fields: [
          { name: 'versao', type: 'number', required: true, onlyInt: true },
          { name: 'ligado', type: 'bool' },
          { name: 'usar_horario', type: 'bool' },
          { name: 'dias', type: 'text', max: 100 },
          { name: 'hora_inicio', type: 'text', max: 5 },
          { name: 'hora_fim', type: 'text', max: 5 },
          { name: 'janela_min', type: 'number', onlyInt: true },
          { name: 'textos', type: 'text', max: 100000 },
          { name: 'faq', type: 'text', max: 100000 },
          { name: 'palavras', type: 'text', max: 50000 },
          { name: 'observacao', type: 'text', max: 300 },
          { name: 'autor_id', type: 'text', max: 15 },
          { name: 'autor_nome', type: 'text', max: 200 },
          { name: 'created', type: 'autodate', onCreate: true, onUpdate: false },
          { name: 'updated', type: 'autodate', onCreate: true, onUpdate: true },
        ],
        indexes: ['CREATE UNIQUE INDEX idx_atend_cfg_versao ON atendimento_config (versao)'],
      })
      app.save(col)
      console.log('0111: coleção atendimento_config criada')
    }

    var existentes = []
    try {
      existentes = app.findRecordsByFilter(col, '', '', 1, 0)
    } catch (e1) {}
    if (existentes && existentes.length > 0) return

    const PADRAO = {
      textos: {
        horario:
          'Nosso horário de atendimento é de segunda a sexta, das 8:00h às 17:30h. Se você mandou essa mensagem fora desse horário, um vendedor vai te responder assim que abrir o expediente. Obrigado pela paciência! ✨',
        menu_meta:
          'Bem-vindo(a) a *Haisan*! 💎\nSomos uma *fábrica brasileira de móveis* para salão de beleza, barbearia e clínica de estética, com *mais de 30 anos* de história.\nVocê está falando com o *assistente virtual da Haisan*. 😃\nPara agilizar seu atendimento, pode nos dizer qual linha é do seu interesse?\n💈 *Barbearia*\n🪞 *Salão de Beleza*\n🧴 *Podologia ou Estética*\n💅 *Manicure e Pedicure*',
        menu_organico:
          'Bem-vindo(a) a *Haisan*! 💎\nSomos uma *fábrica brasileira de móveis* para salão de beleza, barbearia e clínica de estética, com *mais de 30 anos* de história.\nVocê está falando com o *assistente virtual da Haisan*. 😃\nPara agilizar seu atendimento, pode nos dizer qual linha é do seu interesse?\n💈 *Barbearia*\n🪞 *Salão de Beleza*\n🧴 *Podologia ou Estética*\n💅 *Manicure e Pedicure*\n🛠️ *Manutenção dos móveis Haisan*',
        transferencia_consultor:
          'Certo! 😊 Já te encaminhei pro nosso time de vendas! Seu consultor será o *{nome}* — nos próximos minutos você recebe uma mensagem dele pelo número *{numero}*. Pode salvar como *Haisan Vendas*! 😊',
        transferencia_consultor_sem_numero:
          'Certo! 😊 Já te encaminhei pro nosso time de vendas! Seu consultor será o *{nome}*. Pode salvar como *Haisan Vendas*! 😊',
        encaminhar_humano:
          'Entendo! Vou te encaminhar AGORA para um dos nossos vendedores, só um momento! ☺️',
        fora_escopo: 'Vou te encaminhar para um de nossos vendedores, só um momento!',
        nao_entendi: 'Desculpe, não entendi. 😊 Pode escolher uma das opções?',
        pede_documento_manutencao:
          'Por gentileza, poderia me informar o seu CPF ou CNPJ? Assim já te encaminho pro setor responsável.',
        pergunta_origem:
          'Me conte, de onde você nos conheceu?\n🔹 *Pesquisei no Google*\n🔹 *Vi anúncio no Instagram/Facebook*',
        abrindo_ampliando:
          'Legal!😃 Você está abrindo um novo espaço ou ampliando um que já existe?',
        origem_invalida:
          'Pode me dizer por onde nos conheceu?\n🔹 *Pesquisei no Google*\n🔹 *Vi anúncio no Instagram/Facebook*',
        origem_google:
          'Legal que você veio pelo Google! 😃 Você está abrindo um novo espaço ou ampliando um que já existe?',
        origem_meta:
          'Legal que você veio pelo Instagram/Facebook! 😃 Você está abrindo um novo espaço ou ampliando um que já existe?',
        cliente_ou_primeiro:
          'Perfeito! 😊 Você já é cliente Haisan ou é seu primeiro contato com a gente?',
        pede_documento_vendas:
          'Por gentileza, poderia me informar o seu CPF ou CNPJ? Assim já te encaminho pro setor de vendas.',
        documento_invalido:
          'Por favor, me informe o CPF ou CNPJ (só os números) para eu te encaminhar corretamente. 😊',
        manutencao_ok:
          'Aguarde alguns minutos, que irei lhe encaminhar para o setor responsável. ☺️',
        cliente_ok:
          'Obrigado pela informação... Aguarde alguns minutos, que irei lhe encaminhar para um vendedor Haisan. ☺️',
      },
      palavras: {
        humano: [
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
        ],
        estresse: [
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
        ],
        fora_escopo: [
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
        ],
        ja_cliente: ['ja sou', 'sou cliente', 'cliente haisan', 'ja comprei', 'sim'],
        linha_barbearia: ['barbearia', 'barbeiro', 'barber'],
        linha_salao: ['salao', 'cabeleireiro', 'cabelo'],
        linha_podologia: ['podologia', 'podologo', 'estetica', 'esteta'],
        linha_manicure: ['manicure', 'pedicure', 'unha'],
        linha_manutencao: ['manutencao', 'consertar', 'conserto', 'quebrou', 'reparo'],
      },
      faq: [
        {
          pergunta: 'Prazo de produção e entrega',
          chaves: ['prazo', 'quanto tempo', 'demora', 'producao', 'entrega'],
          resposta:
            'O nosso prazo de produção é de 30 dias corridos. Mas também o prazo de transporte que deve ser confirmado com o nosso time de vendas.',
        },
        {
          pergunta: 'Endereço da fábrica e showroom',
          chaves: ['endereco', 'onde fica', 'onde voces ficam', 'localizacao', 'showroom'],
          resposta:
            'Estamos na Rua Kival Fernando Pereira, 125, Centro, São José dos Pinhais – PR. Temos fábrica e showroom no mesmo endereço.',
        },
      ],
    }

    const r = new Record(col)
    r.set('versao', 1)
    r.set('ligado', true)
    r.set('usar_horario', false)
    r.set('dias', JSON.stringify([1, 2, 3, 4, 5]))
    r.set('hora_inicio', '08:00')
    r.set('hora_fim', '17:30')
    r.set('janela_min', 30)
    r.set('textos', JSON.stringify(PADRAO.textos))
    r.set('faq', JSON.stringify(PADRAO.faq))
    r.set('palavras', JSON.stringify(PADRAO.palavras))
    r.set(
      'observacao',
      'Versão inicial: textos e regras do robô ligado em 04/11 (iguais ao agente antigo)',
    )
    r.set('autor_id', '')
    r.set('autor_nome', 'Sistema')
    app.save(r)
    console.log('0111: versão 1 da configuração do atendimento gravada')
  },
  (app) => {
    // reversão: remove a coleção (o robô volta a usar os textos do código)
    try {
      const col = app.findCollectionByNameOrId('atendimento_config')
      app.delete(col)
    } catch (e) {}
  },
)
