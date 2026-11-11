/// <reference path="../pb_data/types.d.ts" />
/**
 * REGISTRA O CRON `wa_roteiro` (11/11) — piloto.
 *
 * **A causa raiz do piloto:** o cron do robô (`wa_roteiro`, 1 min) **não está**
 * em `_cron_settings`. São 8 jobs registrados e ele não é um deles — por isso
 * **0 mensagens da IA em 24h** e a conversa de 11:43 foi transferida sem o robô
 * falar.
 *
 * **É o mesmo defeito do `wa_aviso_lead_novo`** (CA-3-110): `cronAdd` no arquivo
 * não basta; o job tem de estar na lista.
 *
 * GET /backend/v1/piloto/registra-roteiro
 */
routerAdd(
  'GET',
  '/backend/v1/piloto/registra-roteiro',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, criados: [], ja_existiam: [] }

    // os crons do robô e das filas que devem estar registrados
    const JOBS = ['wa_roteiro', 'whatsapp_envios_fila', 'wa_apresentacao_15min', 'wa_ia_lead']

    for (const job of JOBS) {
      var existe = false
      try {
        const ja = app.findRecordsByFilter('_cron_settings', "job='" + job + "'", '', 1, 0)
        existe = ja && ja.length > 0
      } catch (e0) {}

      if (existe) {
        out.ja_existiam.push(job)
        continue
      }

      try {
        const col = app.findCollectionByNameOrId('_cron_settings')
        const r = new Record(col)
        r.set('job', job)
        r.set('disabled', 'false')
        r.set(
          'reason',
          'registro restaurado 11/11 — o cronAdd existia mas o job nao estava na lista',
        )
        r.set('label', '')
        app.save(r)
        out.criados.push(job)
      } catch (e1) {
        out.erro = String(e1).slice(0, 200)
      }
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
