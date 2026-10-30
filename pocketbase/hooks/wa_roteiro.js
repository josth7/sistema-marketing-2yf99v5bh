/// <reference path="../pb_data/types.d.ts" />
/**
 * MOTOR DO ROTEIRO DE ATENDIMENTO — IA da central (30/10).
 *
 * Replica o agente da Movienari (configuração passada pelo dono em 22/10,
 * em artifacts/agente-atendimento-haisan.md). Roteiro RÍGIDO.
 *
 * LIÇÃO JSVM (custou 2 arquivos 404 hoje): `function`/`var` no TOPO do arquivo
 * QUEBRA a carga do hook inteiro — toda rota do arquivo vira 404. Nada de
 * helper global: tudo INLINE nos callbacks, ou (para o cron) duplicado.
 *
 * ROTAS:
 *   POST /backend/v1/whatsapp/roteiro/simular        { etapa, texto }
 *   POST /backend/v1/whatsapp/roteiro/simular-fluxo  { passos: [...] }
 *
 * CRON: wa_roteiro (1 min) — conversas da CENTRAL em `triagem`, cliente falou
 * por último, decide a etapa e enfileira (motivo `ia_roteiro`).
 */

// ==================== SIMULAR UM PASSO ====================
routerAdd(
  'POST',
  '/backend/v1/whatsapp/roteiro/simular',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    // ---------- catálogo (inline) ----------
    const LINHAS = [
      { chave: 'barbearia', termos: ['barbearia', 'barbeiro', 'barber'] },
      { chave: 'salao', termos: ['salao', 'cabeleireiro', 'cabelo'] },
      { chave: 'podologia', termos: ['podologia', 'podologo', 'estetica', 'esteta'] },
      { chave: 'manicure', termos: ['manicure', 'pedicure', 'unha'] },
      { chave: 'manutencao', termos: ['manutencao', 'consertar', 'conserto', 'quebrou', 'reparo'] },
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
      'telefone de contato',
      'saco',
      'robo',
      'bot',
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
    const MENU =
      'Bem-vindo(a) a *Haisan*! 💎\n' +
      'Somos uma *fábrica brasileira de móveis* para salão de beleza, barbearia e clínica de estética, com *mais de 30 anos* de história.\n' +
      'Você está falando com o *assistente virtual da Haisan*. 😃\n' +
      'Para agilizar seu atendimento, pode nos dizer qual linha é do seu interesse?\n' +
      '💈 *Barbearia*\n' +
      '🪞 *Salão de Beleza*\n' +
      '🧴 *Podologia ou Estética*\n' +
      '💅 *Manicure e Pedicure*\n' +
      '🛠️ *Manutenção dos móveis Haisan*'

    // ---------- helpers (inline) ----------
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
    const etapaIn = String(body.etapa || '')
    const texto = String(body.texto || '')
    var etapa = etapaIn

    // ---------- 0. prioridade: humano / estresse ----------
    if (contemAlgum(texto, SINAIS_HUMANO)) {
      return e.json(200, {
        ok: true,
        saida: {
          etapa: 'humano',
          motivo: 'cliente_pediu_humano',
          transferir: true,
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
          respostas: [
            'Entendo! Vou te encaminhar AGORA para um dos nossos vendedores, só um momento! ☺️',
            HORARIO,
          ],
        },
      })
    }

    // ---------- 1. FAQ (só as 2 cadastradas) ----------
    var faqAchado = null
    for (var f = 0; f < FAQ.length; f++) {
      if (contemAlgum(texto, FAQ[f].chaves)) {
        faqAchado = FAQ[f]
        break
      }
    }
    if (faqAchado) {
      return e.json(200, {
        ok: true,
        saida: {
          etapa: etapa === '' ? 'menu' : etapa,
          motivo: 'faq',
          transferir: false,
          respostas: [faqAchado.resposta],
        },
      })
    }

    // ---------- 2. fora do escopo (preço/prazo/pagamento) ----------
    if (contemAlgum(texto, FORA_ESCOPO)) {
      return e.json(200, {
        ok: true,
        saida: {
          etapa: 'humano',
          motivo: 'pergunta_fora_do_escopo',
          transferir: true,
          respostas: ['Vou te encaminhar para um de nossos vendedores, só um momento!', HORARIO],
        },
      })
    }

    // ---------- 3. fluxo ----------
    if (etapa === '' || etapa === 'e1') {
      return e.json(200, {
        ok: true,
        saida: { etapa: 'menu', motivo: 'boas_vindas', transferir: false, respostas: [MENU] },
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
            linha: linha.chave,
            respostas: [
              'Por gentileza, poderia me informar o seu CPF ou CNPJ? Assim já te encaminho pro setor responsável.',
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
          linha: linha.chave,
          respostas: [
            'Legal!😃 Antes de te encaminhar para a nossa equipe comercial, gostaria fazer algumas perguntas para personalizar o seu atendimento.\nVai ser bem rapidinho, prometo. 😄\nVocê está *abrindo* um novo espaço ou *ampliando* um que já existe?',
          ],
        },
      })
    }

    if (etapa === 'e2') {
      return e.json(200, {
        ok: true,
        saida: {
          etapa: 'e3',
          motivo: 'abrindo_ou_ampliando',
          transferir: false,
          respostas: [
            'Perfeito! 😊 Você já é cliente Haisan ou é seu primeiro contato com a gente?',
          ],
        },
      })
    }

    if (etapa === 'e3') {
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
            respostas: [
              'Por gentileza, poderia me informar o seu CPF ou CNPJ? Assim já te encaminho pro setor de vendas.',
            ],
          },
        })
      }
      return e.json(200, {
        ok: true,
        saida: {
          etapa: 'e4',
          motivo: 'primeiro_contato',
          transferir: true,
          respostas: ['__CONSULTOR__', HORARIO],
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
          respostas: [
            'Obrigado pela informação... Aguarde alguns minutos, que irei lhe encaminhar para um vendedor Haisan. ☺️',
            HORARIO,
          ],
        },
      })
    }

    return e.json(200, {
      ok: true,
      saida: { etapa: 'menu', motivo: 'reinicio', transferir: false, respostas: [MENU] },
    })
  },
  $apis.requireAuth(),
)

// ==================== SIMULAR FLUXO COMPLETO ====================
routerAdd(
  'POST',
  '/backend/v1/whatsapp/roteiro/simular-fluxo',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}
    var passos = body.passos || []
    if (!Array.isArray(passos)) return e.json(400, { ok: false, erro: 'passos deve ser lista' })

    // mesma lógica, rodando passo a passo (inline; JSVM não aceita helper global)
    const LINHAS = [
      { chave: 'barbearia', termos: ['barbearia', 'barbeiro', 'barber'] },
      { chave: 'salao', termos: ['salao', 'cabeleireiro', 'cabelo'] },
      { chave: 'podologia', termos: ['podologia', 'podologo', 'estetica', 'esteta'] },
      { chave: 'manicure', termos: ['manicure', 'pedicure', 'unha'] },
      { chave: 'manutencao', termos: ['manutencao', 'consertar', 'conserto', 'quebrou', 'reparo'] },
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
    const MENU =
      'Bem-vindo(a) a *Haisan*! 💎\nSomos uma *fábrica brasileira de móveis* para salão de beleza, barbearia e clínica de estética, com *mais de 30 anos* de história.\nVocê está falando com o *assistente virtual da Haisan*. 😃\nPara agilizar seu atendimento, pode nos dizer qual linha é do seu interesse?\n💈 *Barbearia*\n🪞 *Salão de Beleza*\n🧴 *Podologia ou Estética*\n💅 *Manicure e Pedicure*\n🛠️ *Manutenção dos móveis Haisan*'
    const CONSULTOR =
      'Certo! 😊 Já te encaminhei pro nosso time de vendas! Seu consultor será o *[CONSULTOR]* — nos próximos minutos você recebe uma mensagem dele pelo número *[NÚMERO]*. Pode salvar como *Haisan Vendas*! 😊'

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

    var etapa = ''
    var trilha = []
    var transferiu = false

    for (var p = 0; p < passos.length; p++) {
      var texto = String(passos[p] || '')
      var antes = etapa
      var respostas = []
      var motivo = ''
      var transfere = false

      if (contemAlgum(texto, SINAIS_HUMANO)) {
        etapa = 'humano'
        motivo = 'cliente_pediu_humano'
        transfere = true
        respostas = [
          'Entendo! Vou te encaminhar AGORA para um dos nossos vendedores, só um momento! ☺️',
          HORARIO,
        ]
      } else if (contemAlgum(texto, SINAIS_ESTRESSE)) {
        etapa = 'humano'
        motivo = 'cliente_impaciente'
        transfere = true
        respostas = [
          'Entendo! Vou te encaminhar AGORA para um dos nossos vendedores, só um momento! ☺️',
          HORARIO,
        ]
      } else {
        var faqA = null
        for (var f2 = 0; f2 < FAQ.length; f2++) {
          if (contemAlgum(texto, FAQ[f2].chaves)) {
            faqA = FAQ[f2]
            break
          }
        }
        var fora = contemAlgum(texto, FORA_ESCOPO)

        if (faqA) {
          motivo = 'faq'
          respostas = [faqA.resposta]
        } else if (fora) {
          etapa = 'humano'
          motivo = 'pergunta_fora_do_escopo'
          transfere = true
          respostas = ['Vou te encaminhar para um de nossos vendedores, só um momento!', HORARIO]
        } else if (etapa === '' || etapa === 'e1') {
          etapa = 'menu'
          motivo = 'boas_vindas'
          respostas = [MENU]
        } else if (etapa === 'menu') {
          var linhaA = null
          for (var l2 = 0; l2 < LINHAS.length; l2++) {
            if (contemAlgum(texto, LINHAS[l2].termos)) {
              linhaA = LINHAS[l2]
              break
            }
          }
          if (!linhaA) {
            motivo = 'menu_opcao_invalida'
            respostas = ['Desculpe, não entendi. 😊 Pode escolher uma das opções?', MENU]
          } else if (linhaA.chave === 'manutencao') {
            etapa = 'manut1'
            motivo = 'manutencao_pede_documento'
            respostas = [
              'Por gentileza, poderia me informar o seu CPF ou CNPJ? Assim já te encaminho pro setor responsável.',
            ]
          } else {
            etapa = 'e2'
            motivo = 'respondeu_linha'
            respostas = [
              'Legal!😃 Antes de te encaminhar para a nossa equipe comercial, gostaria fazer algumas perguntas para personalizar o seu atendimento.\nVai ser bem rapidinho, prometo. 😄\nVocê está *abrindo* um novo espaço ou *ampliando* um que já existe?',
            ]
          }
        } else if (etapa === 'e2') {
          etapa = 'e3'
          motivo = 'abrindo_ou_ampliando'
          respostas = [
            'Perfeito! 😊 Você já é cliente Haisan ou é seu primeiro contato com a gente?',
          ]
        } else if (etapa === 'e3') {
          if (
            contemAlgum(texto, ['ja sou', 'sou cliente', 'cliente haisan', 'ja comprei', 'sim'])
          ) {
            etapa = 'e5'
            motivo = 'ja_e_cliente'
            respostas = [
              'Por gentileza, poderia me informar o seu CPF ou CNPJ? Assim já te encaminho pro setor de vendas.',
            ]
          } else {
            etapa = 'e4'
            motivo = 'primeiro_contato'
            transfere = true
            respostas = [CONSULTOR, HORARIO]
          }
        } else if (etapa === 'e5' || etapa === 'manut1') {
          var digs = String(texto).replace(/[^0-9]/g, '')
          if (digs.length < 11) {
            motivo = 'documento_invalido'
            respostas = [
              'Por favor, me informe o CPF ou CNPJ (só os números) para eu te encaminhar corretamente. 😊',
            ]
          } else if (etapa === 'manut1') {
            etapa = 'manut2'
            motivo = 'manutencao_transferida'
            transfere = true
            respostas = [
              'Aguarde alguns minutos, que irei lhe encaminhar para o setor responsável. ☺️',
              HORARIO,
            ]
          } else {
            etapa = 'e6'
            motivo = 'cliente_transferido'
            transfere = true
            respostas = [
              'Obrigado pela informação... Aguarde alguns minutos, que irei lhe encaminhar para um vendedor Haisan. ☺️',
              HORARIO,
            ]
          }
        } else {
          etapa = 'menu'
          motivo = 'reinicio'
          respostas = [MENU]
        }
      }

      trilha.push({
        recebido: texto,
        etapa_antes: antes,
        etapa_depois: etapa,
        motivo: motivo,
        transferir: transfere,
        respostas: respostas,
      })
      if (transfere) {
        transferiu = true
        break
      }
    }

    return e.json(200, { ok: true, trilha: trilha, etapa_final: etapa, transferiu: transferiu })
  },
  $apis.requireAuth(),
)
