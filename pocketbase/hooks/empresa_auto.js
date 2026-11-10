/// <reference path="../pb_data/types.d.ts" />
/**
 * EMPRESA AUTOMÁTICA NOS REGISTROS NOVOS (10/11) — CA-3-87.
 *
 * **Por que este arquivo e não uma migração:** `col.addHook` dentro de migração
 * não persistiu (o hook nasce e morre com a migração). Aqui o gancho é
 * registrado no **carregamento do hook**, que é como os outros funcionam.
 *
 * **O problema que resolve:** a migração preencheu todo o histórico, mas os
 * registros criados DEPOIS nascem sem `empresa` — verificado: 59 registros,
 * todos criados após a migração, com o webhook recebendo.
 *
 * **A regra:** em toda coleção de negócio, na criação, se `empresa` vier
 * vazio, preenche com a Haisan (a única empresa hoje).
 *
 * IMPORTANTE (JSVM): `onRecordCreateRequest` só vale para rotas HTTP. O webhook
 * grava pelo `$app.save` interno — por isso usamos `onRecordCreate`.
 */
onRecordCreate((e) => {
  try {
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

    const nome = String(e.collection && e.collection.name ? e.collection.name : '')
    if (NEGOCIO.indexOf(nome) < 0) {
      e.next()
      return
    }

    var atual = ''
    try {
      atual = String(e.record.get('empresa') || '')
    } catch (eG) {}
    if (atual !== '') {
      e.next()
      return
    }

    // pega a empresa Haisan (a única hoje)
    var idHaisan = ''
    try {
      const es = $app.findRecordsByFilter('empresas', '', '', 2, 0)
      if (es.length > 0) idHaisan = es[0].id
    } catch (eE) {}
    if (idHaisan !== '') {
      try {
        e.record.set('empresa', idHaisan)
      } catch (eS) {}
    }
  } catch (eTop) {}

  e.next()
})
