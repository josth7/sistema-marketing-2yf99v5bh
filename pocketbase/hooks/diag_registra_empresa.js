/// <reference path="../pb_data/types.d.ts" />
/**
 * REGISTRA `wa_empresa_auto` E PREENCHE O RETRASO (10/11) — CA-3-87.
 *
 * 1. Cria o job em `_cron_settings` (lição do CA-3-110: `cronAdd` no arquivo
 *    não basta, o job tem de estar na lista).
 * 2. Roda a mesma lógica **agora**, para fechar os registros que já ficaram
 *    sem empresa enquanto o cron não estava registrado.
 *
 * GET /backend/v1/diag/registra-empresa
 */
routerAdd(
  'GET',
  '/backend/v1/diag/registra-empresa',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, job_criado: false, ja_existia: false, corrigidos: 0, erro: '' }

    // ---------- 1. registra o job ----------
    try {
      const ja = app.findRecordsByFilter('_cron_settings', "job='wa_empresa_auto'", '', 1, 0)
      if (ja && ja.length > 0) {
        out.ja_existia = true
      } else {
        const col = app.findCollectionByNameOrId('_cron_settings')
        const r = new Record(col)
        r.set('job', 'wa_empresa_auto')
        r.set('disabled', 'false')
        r.set('reason', 'preenche empresa nos registros novos (CA-3-87)')
        r.set('label', '')
        app.save(r)
        out.job_criado = true
      }
    } catch (e1) {
      out.erro = 'job: ' + String(e1).slice(0, 110)
    }

    // ---------- 2. corrige agora ----------
    var idHaisan = ''
    try {
      const es = app.findRecordsByFilter('empresas', '', '', 2, 0)
      if (es.length > 0) idHaisan = es[0].id
    } catch (e2) {}

    if (idHaisan !== '') {
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
        'campanhas',
        'campanha_destinos',
        'metricas_diarias',
        'analyses',
        'analysis_events',
        'reports',
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
        'access_grants',
        'paginas_destino',
        'report_ai_summaries',
        'report_policy',
        'analysis_policy',
        'ai_summary_policy',
        'anuncios_criativos',
        'metricas_diarias_anuncio',
      ]
      for (const nome of NEGOCIO) {
        var regs = []
        try {
          regs = app.findRecordsByFilter(nome, "empresa=''", '', 500, 0)
        } catch (e3) {
          continue
        }
        for (const r of regs) {
          try {
            r.set('empresa', idHaisan)
            app.save(r)
            out.corrigidos++
          } catch (e4) {}
        }
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
