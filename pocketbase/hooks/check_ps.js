/// <reference path="../pb_data/types.d.ts" />
/**
 * PENDÊNCIAS DO STATUS.md — estado real (18/11).
 *
 * Confere no sistema vivo o que o STATUS lista como herdado da fase 2:
 *   1. job da Meta com o filtro RN-06 (não gravar linha vazia / zero falso);
 *   2. setembro do Google — quantos dias têm dado;
 *   3. espelho de estado no Skip (`.adapta-cliente/estado-atual.md`) e sua data;
 *   4. segredo `MAESTRO_SHARED_SECRET` — existe? é o de teste?
 *   5. crons da fase 2 (alerta, lembrete, relatório) registrados e ativos.
 *
 * Só leitura.
 *
 * GET /backend/v1/check/pendencias-status
 */
routerAdd(
  'GET',
  '/backend/v1/check/pendencias-status',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true }

    // ---------- 1. Meta: linhas vazias (RN-06) ----------
    var metaZero = 0
    var metaTotal = 0
    try {
      const ms = app.findRecordsByFilter(
        app.findCollectionByNameOrId('metricas_diarias'),
        "canal='meta_ads'",
        '-data',
        2000,
        0,
      )
      metaTotal = ms.length
      for (const m of ms) {
        const imp = Number(m.get('impressoes') || 0)
        const cli = Number(m.get('cliques') || 0)
        const gas = Number(m.get('gasto') || 0)
        const alc = Number(m.get('alcance') || 0)
        // linha "vazia" = todas as métricas de mídia nulas/zero e sem seguidores
        const seg = Number(m.get('seguidores') || 0)
        if (imp === 0 && cli === 0 && gas === 0 && alc === 0 && seg === 0) metaZero++
      }
    } catch (e1) {}
    out.meta = {
      registros: metaTotal,
      linhas_vazias: metaZero,
      rn06_ok: metaZero === 0,
    }

    // ---------- 2. setembro do Google ----------
    var diasSetembro = {}
    try {
      for (const m of app.findRecordsByFilter(
        app.findCollectionByNameOrId('metricas_diarias'),
        "canal='google_ads' && data>='2026-09-01' && data<='2026-09-30'",
        '',
        300,
        0,
      )) {
        diasSetembro[String(m.get('data') || '').slice(0, 10)] = true
      }
    } catch (e2) {}
    out.google_setembro = {
      dias_com_dado: Object.keys(diasSetembro).length,
      dias: Object.keys(diasSetembro).sort(),
    }

    // ---------- 3. crons da fase 2 ----------
    out.crons = []
    try {
      for (const c of app.findRecordsByFilter('_cron_settings', '', 'job', 200, 0)) {
        const j = String(c.get('job') || '')
        if (
          j.indexOf('alerta') >= 0 ||
          j.indexOf('lembrete') >= 0 ||
          j.indexOf('relatorio') >= 0 ||
          j.indexOf('meta_ingestao') >= 0 ||
          j.indexOf('wa_roteiro') >= 0 ||
          j.indexOf('wa_aviso_lead') >= 0
        ) {
          out.crons.push({ job: j, disabled: c.get('disabled') === true })
        }
      }
    } catch (e3) {}

    // ---------- 4. segredo do Maestro ----------
    try {
      const s = String($secrets.get('MAESTRO_SHARED_SECRET') || '')
      out.maestro_segredo = {
        existe: s !== '',
        // não imprimo o valor: só se parece com o de teste
        parece_teste: s.indexOf('teste') >= 0 || s.indexOf('TESTE') >= 0 || s.length < 24,
      }
    } catch (e4) {
      out.maestro_segredo = { existe: false }
    }

    // ---------- 5. itens abertos de trabalho ----------
    var pa = 0
    try {
      pa = app.findRecordsByFilter(
        app.findCollectionByNameOrId('precisa_acao'),
        'resolvido=false',
        '',
        50,
        0,
      ).length
    } catch (e5) {}
    out.precisa_acao_abertos = pa

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
