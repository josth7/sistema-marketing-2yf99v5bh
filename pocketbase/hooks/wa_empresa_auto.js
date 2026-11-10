/// <reference path="../pb_data/types.d.ts" />
/**
 * PREENCHE A EMPRESA NOS REGISTROS NOVOS — cron (10/11) — CA-3-87.
 *
 * **Por que cron e não gancho:** tentei `col.addHook` dentro de migração (não
 * persistiu) e `onRecordCreate` em arquivo de hook (publicado, mas não dispara
 * para o `$app.save` interno do webhook). O cron **não depende de gancho** —
 * ele lê e corrige, então não tem como falhar em silêncio.
 *
 * **O problema medido:** a migração preencheu 85.890 registros do histórico;
 * os criados DEPOIS nascem vazios (170 e crescendo, com o webhook recebendo).
 * Num sistema multi-tenant, registro sem empresa é invisível **ou vaza**.
 *
 * **A regra:** a cada minuto, varre as coleções de negócio e preenche `empresa`
 * com a Haisan em quem estiver vazio.
 */
cronAdd('wa_empresa_auto', '* * * * *', () => {
  try {
    const app = $app

    // empresa Haisan (a única hoje)
    var idHaisan = ''
    try {
      const es = app.findRecordsByFilter('empresas', '', '', 2, 0)
      if (es.length > 0) idHaisan = es[0].id
    } catch (e0) {}
    if (idHaisan === '') return

    // as coleções que mais crescem primeiro (webhook grava nelas)
    const NEGOCIO = [
      'whatsapp_mensagens',
      'whatsapp_eventos',
      'whatsapp_conversas',
      'whatsapp_envios',
      'crm_lead_events',
      'crm_leads',
      'whatsapp_transferencias',
      'precisa_acao',
      'inbox_items',
      'conversion_events',
      'whatsapp_sinais',
      'whatsapp_observacoes',
      'carteira_contatos',
      'campanha_destinos',
      'campanhas',
      'metricas_diarias',
      'metricas_diarias_anuncio',
      'anuncios_criativos',
      'paginas_destino',
      'analyses',
      'analysis_events',
      'reports',
      'report_ai_summaries',
      'decisions',
      'alerts',
      'alert_criteria',
      'canal_avisos',
      'canal_estado',
      'fontes_estado',
      'access_audit',
      'admin_config',
      'atendimento_config',
      'opt_out',
      'whatsapp_conexoes',
      'whatsapp_numeros_internos',
      'whatsapp_midia',
      'whatsapp_historico_bruto',
      'whatsapp_avisos_email',
      'concorrentes_obs',
      'analysis_policy',
      'ai_summary_policy',
      'report_policy',
      'access_grants',
    ]

    var corrigidos = 0
    for (const nome of NEGOCIO) {
      // para cedo se já corrigiu bastante nesta rodada (não trava o cron)
      if (corrigidos >= 400) break
      var regs = []
      try {
        regs = app.findRecordsByFilter(nome, "empresa=''", '', 400, 0)
      } catch (e1) {
        continue
      }
      for (const r of regs) {
        try {
          r.set('empresa', idHaisan)
          app.save(r)
          corrigidos++
        } catch (e2) {}
      }
    }

    if (corrigidos > 0) {
      console.log('wa_empresa_auto: ' + corrigidos + ' registro(s) sem empresa corrigido(s)')
    }
  } catch (eTop) {
    console.log('wa_empresa_auto: erro -> ' + String(eTop).slice(0, 120))
  }
})
