/// <reference path="../pb_data/types.d.ts" />
/**
 * REGISTRA O CRON PERDIDO (09/11) — CA-3-110.
 *
 * **O achado:** `wa_aviso_lead_novo` tem o `cronAdd` no arquivo publicado, mas
 * **não existe** em `_cron_settings`. Os outros 4 jobs estão lá, ele não. Por
 * isso nunca roda, nunca loga e os leads sem dono não são distribuídos.
 *
 * **O que esta rota faz:** cria o registro em `_cron_settings` para o job
 * `wa_aviso_lead_novo`, seguindo o formato dos que funcionam.
 *
 * GET /backend/v1/diag/registra-cron
 */
routerAdd(
  'GET',
  '/backend/v1/diag/registra-cron',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, jaExistia: false, criado: false, erro: '' }

    // já existe?
    try {
      const ja = app.findRecordsByFilter('_cron_settings', "job='wa_aviso_lead_novo'", '', 1, 0)
      if (ja && ja.length > 0) {
        out.jaExistia = true
        const j = ja[0]
        out.registro = {
          job: String(j.get('job') || ''),
          disabled: String(j.get('disabled') || ''),
        }
        return e.json(200, out)
      }
    } catch (e0) {
      out.erro = 'busca: ' + String(e0).slice(0, 100)
    }

    // cria seguindo o formato dos que funcionam
    try {
      const col = app.findCollectionByNameOrId('_cron_settings')
      const r = new Record(col)
      r.set('job', 'wa_aviso_lead_novo')
      r.set('disabled', 'false')
      r.set('reason', 'registro restaurado 09/11 — o cronAdd existia mas o job nao estava na lista')
      r.set('label', '')
      app.save(r)
      out.criado = true
      out.id = r.id
    } catch (e1) {
      out.erro = 'criar: ' + String(e1).slice(0, 160)
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
