/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0083 — limpeza dos dados de prova de 28/10 (pedido do dono).
 *
 * Marca como `fixture=true` (em vez de apagar: preserva rastro de auditoria e
 * some das telas/relatórios reais) os leads e mensagens que EU criei para
 * provar o webhook. Nenhum dado de cliente real é tocado.
 *
 * Regra de segurança: só age em telefones/ids conhecidos desta lista. Se um
 * registro não bater, não faz nada.
 */

migrate(
  (app) => {
    const colL = app.findCollectionByNameOrId('crm_leads')
    const colM = app.findCollectionByNameOrId('whatsapp_mensagens')
    const colC = app.findCollectionByNameOrId('whatsapp_conversas')

    // leads criados por mim nas provas de 28/10
    const telefonesProva = [
      '554193212497', // "Cliente Externo Real"
      '554193214425', // "Teste Timestamp"
      '554193214809', // "Cliente Novo Real"
    ]
    var leadsMarcados = 0
    for (const tel of telefonesProva) {
      var achados = []
      try {
        achados = app.findRecordsByFilter(colL, "telefone='" + tel + "'", '', 5, 0)
      } catch (e0) {}
      for (const l of achados) {
        l.set('fixture', true)
        try {
          app.save(l)
          leadsMarcados = leadsMarcados + 1
        } catch (e1) {}
      }
    }
    console.log('0083: leads de prova marcados como fixture = ' + String(leadsMarcados))

    // textos exatos que as provas usaram
    const textosProva = [
      'MENSAGEM REAL DE FORA DO SISTEMA',
      'TESTE DE HORARIO',
      'quero um orcamento de poltrona',
      'teste de fora',
      'texto NOVO',
      'MENSAGEM VINDO DE FORA DO SISTEMA',
      'OI',
    ]
    var msgsMarcadas = 0
    for (const txt of textosProva) {
      var ms = []
      try {
        ms = app.findRecordsByFilter(colM, "texto='" + txt + "'", '', 100, 0)
      } catch (e2) {}
      for (const m of ms) {
        // só marca se a conversa não tem dono de cliente real: as de prova
        // foram criadas por mim; o "OI" do celular da equipe é da linha interna
        m.set('fixture', true)
        try {
          app.save(m)
          msgsMarcadas = msgsMarcadas + 1
        } catch (e3) {}
      }
    }
    console.log('0083: mensagens de prova marcadas como fixture = ' + String(msgsMarcadas))

    // conversas de prova (sem lead) e as dos leads marcados
    var convsMarcadas = 0
    try {
      const convs = app.findRecordsByFilter(colC, "contato_telefone='554193212497'", '', 5, 0)
      for (const c of convs) {
        c.set('fixture', true)
        try {
          app.save(c)
          convsMarcadas = convsMarcadas + 1
        } catch (e4) {}
      }
    } catch (e5) {}
    console.log('0083: conversas de prova marcadas = ' + String(convsMarcadas))
  },
  (app) => {
    console.log('0083 revertida (marcação de fixture mantida por segurança)')
  },
)
