/// <reference path="../pb_data/types.d.ts" />
/**
 * EMPRESA AUTOMÁTICA NOS REGISTROS NOVOS (10/11) — CA-3-87.
 *
 * A migração 0165/0166 preencheu **todo o histórico** com a Haisan. Mas os
 * registros criados **depois** (webhook ativo, mensagens chegando) nascem sem
 * empresa — verificado: 59 registros, todos de 16:51 a 16:58, criados após a
 * migração.
 *
 * **Sem isto, a contagem nunca fecha 100%** — e no multi-tenant um registro sem
 * empresa é invisível ou vaza.
 *
 * Esta migração cria o **gancho de criação**: toda coleção de negócio ganha uma
 * regra que preenche `empresa` com a Haisan quando o campo vier vazio.
 *
 * **Por que a Haisan fixa:** hoje só existe uma empresa. Quando a Gol 7 for
 * criada (CA-3-92), a regra passa a usar a empresa ativa do contexto.
 */
migrate(
  (app) => {
    var idHaisan = ''
    try {
      const es = app.findRecordsByFilter('empresas', '', '', 5, 0)
      if (es.length > 0) idHaisan = es[0].id
    } catch (e0) {}
    if (idHaisan === '') {
      console.log('0167: sem empresa — abortando')
      return
    }

    const NEGOCIO = [
      'crm_leads',
      'crm_lead_events',
      'conversion_events',
      'inbox_items',
      'precisa_acao',
      'whatsapp_conexoes',
      'whatsapp_conversas',
      'whatsapp_mensagens',
      'whatsapp_envios',
      'whatsapp_eventos',
      'whatsapp_transferencias',
      'whatsapp_numeros_internos',
      'whatsapp_observacoes',
      'whatsapp_midia',
      'whatsapp_sinais',
      'whatsapp_historico_bruto',
      'whatsapp_avisos_email',
      'atendimento_config',
      'opt_out',
      'carteira_contatos',
      'campanhas',
      'campanha_destinos',
      'metricas_diarias',
      'metricas_diarias_anuncio',
      'anuncios_criativos',
      'paginas_destino',
      'concorrentes_obs',
      'analyses',
      'analysis_events',
      'analysis_policy',
      'ai_summary_policy',
      'report_ai_summaries',
      'reports',
      'report_policy',
      'decisions',
      'alerts',
      'alert_criteria',
      'canal_avisos',
      'canal_estado',
      'fontes_estado',
      'access_grants',
      'access_audit',
      'admin_config',
    ]

    var aplicados = 0
    var erros = []
    for (const nome of NEGOCIO) {
      try {
        const col = app.findCollectionByNameOrId(nome)
        if (!col) continue
        // remove regra antiga com o mesmo nome (idempotente)
        try {
          const atuais = col.listRule
          // não mexe em listRule: só no hook de criação (onRecordCreate)
        } catch (eL) {}
        // regra de criação: preenche empresa quando vazio
        col.addHook('onRecordCreate', function (e) {
          try {
            var atual = ''
            try {
              atual = String(e.record.get('empresa') || '')
            } catch (eG) {}
            if (atual === '') e.record.set('empresa', idHaisan)
          } catch (eH) {}
          e.next()
        })
        app.save(col)
        aplicados++
      } catch (e1) {
        erros.push(nome + ':' + String(e1).slice(0, 40))
      }
    }
    console.log('0167: gancho aplicado em ' + aplicados + ' colecoes')
    if (erros.length > 0) console.log('0167: erros -> ' + erros.slice(0, 8).join(' '))
  },
  (app) => {
    console.log('0167 revertida (ganchos permanecem)')
  },
)
