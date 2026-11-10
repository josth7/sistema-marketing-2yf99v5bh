/// <reference path="../pb_data/types.d.ts" />
/**
 * REGISTRA O CRON `wa_orfaos` (10/11).
 *
 * Lição de ontem (CA-3-110): ter `cronAdd` no arquivo **não basta** — o job
 * precisa estar em `_cron_settings`, senão nunca roda e nunca loga.
 *
 * GET /backend/v1/diag/registra-orfaos
 */
routerAdd(
  'GET',
  '/backend/v1/diag/registra-orfaos',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, jaExistia: false, criado: false, erro: '' }

    try {
      const ja = app.findRecordsByFilter('_cron_settings', "job='wa_orfaos'", '', 1, 0)
      if (ja && ja.length > 0) {
        out.jaExistia = true
        return e.json(200, out)
      }
    } catch (e0) {}

    try {
      const col = app.findCollectionByNameOrId('_cron_settings')
      const r = new Record(col)
      r.set('job', 'wa_orfaos')
      r.set('disabled', 'false')
      r.set('reason', 'varredura de orfaos 10/11')
      r.set('label', '')
      app.save(r)
      out.criado = true
      out.id = r.id
    } catch (e1) {
      out.erro = String(e1).slice(0, 160)
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
