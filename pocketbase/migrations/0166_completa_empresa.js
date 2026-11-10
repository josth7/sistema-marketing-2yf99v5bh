/// <reference path="../pb_data/types.d.ts" />
/**
 * COMPLETA O CAMPO `empresa` (10/11) — CA-3-87.
 *
 * A migração 0165 preencheu 85.903 de 85.932. Faltam 29 registros — os criados
 * entre a leitura e a gravação, ou que o lote não alcançou.
 *
 * Esta migração percorre TODAS as coleções de negócio de novo e preenche só
 * quem ficou vazio. Idempotente: rodar de novo não muda nada.
 */
migrate(
  (app) => {
    // empresa Haisan
    var idHaisan = ''
    try {
      const es = app.findRecordsByFilter('empresas', '', '', 5, 0)
      if (es.length > 0) idHaisan = es[0].id
    } catch (e0) {}
    if (idHaisan === '') {
      console.log('0166: sem empresa — abortando')
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

    var corrigidos = 0
    var sobraram = 0
    for (const nome of NEGOCIO) {
      var regs = []
      try {
        regs = app.findRecordsByFilter(nome, '', '', 200000, 0)
      } catch (e1) {
        continue
      }
      for (const r of regs) {
        if (String(r.get('empresa') || '') !== '') continue
        try {
          r.set('empresa', idHaisan)
          app.save(r)
          corrigidos++
        } catch (e2) {
          sobraram++
        }
      }
    }
    // 2a passada: registros NOVOS entram enquanto a migração roda (o webhook
    // está ativo). Reler e corrigir de novo fecha a janela.
    var corrigidos2 = 0
    for (let volta = 0; volta < 3; volta++) {
      var faltouNesta = 0
      for (const nome of NEGOCIO) {
        var regs2 = []
        try {
          regs2 = app.findRecordsByFilter(nome, '', '', 200000, 0)
        } catch (e3) {
          continue
        }
        for (const r of regs2) {
          if (String(r.get('empresa') || '') !== '') continue
          faltouNesta++
          try {
            r.set('empresa', idHaisan)
            app.save(r)
            corrigidos2++
          } catch (e4) {}
        }
      }
      if (faltouNesta === 0) break
    }
    console.log('0166: corrigidos=' + corrigidos + ' + ' + corrigidos2 + ' sobraram=' + sobraram)
  },
  (app) => {
    console.log('0166 revertida')
  },
)
