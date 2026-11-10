/// <reference path="../pb_data/types.d.ts" />
/**
 * REGISTRA `wa_aviso_resposta` (10/11) — CA-3-112.
 *
 * Lição do CA-3-110: `cronAdd` no arquivo não basta; o job precisa estar em
 * `_cron_settings`. Aqui se cria o registro e confirma a chave ligada.
 *
 * GET /backend/v1/diag/registra-aviso-resposta
 */
routerAdd(
  'GET',
  '/backend/v1/diag/registra-aviso-resposta',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, criado: false, jaExistia: false, chaveLigada: false, erro: '' }

    // chave
    try {
      const vs = app.findRecordsByFilter('admin_config', '', '', 200, 0)
      var cfg = null
      for (const v of vs) {
        if (!cfg || Number(v.get('versao') || 0) > Number(cfg.get('versao') || 0)) cfg = v
      }
      if (cfg) {
        if (cfg.get('aviso_vendedor_ativo') !== true) {
          cfg.set('aviso_vendedor_ativo', true)
          app.save(cfg)
        }
        out.chaveLigada = true
      }
    } catch (e0) {
      out.erro = 'chave: ' + String(e0).slice(0, 100)
    }

    // job
    try {
      const ja = app.findRecordsByFilter('_cron_settings', "job='wa_aviso_resposta'", '', 1, 0)
      if (ja && ja.length > 0) {
        out.jaExistia = true
      } else {
        const col = app.findCollectionByNameOrId('_cron_settings')
        const r = new Record(col)
        r.set('job', 'wa_aviso_resposta')
        r.set('disabled', 'false')
        r.set('reason', 'aviso ao vendedor na central (CA-3-112)')
        r.set('label', '')
        app.save(r)
        out.criado = true
      }
    } catch (e1) {
      out.erro += ' job: ' + String(e1).slice(0, 120)
    }

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
