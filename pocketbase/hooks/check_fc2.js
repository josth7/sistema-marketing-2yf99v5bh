/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/fila-cron',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true }
    // o cron da fila esta registrado?
    out.crons = []
    for (const c of app.findRecordsByFilter('_cron_settings', '', '', 200, 0)) {
      const j = String(c.get('job') || '')
      if (j.indexOf('envio') >= 0 || j.indexOf('fila') >= 0)
        out.crons.push({ job: j, disabled: String(c.get('disabled') || '') })
    }
    // quantos pendentes no total?
    out.pendentes = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "estado='pendente'",
      '',
      500,
      0,
    ).length
    // os mais antigos pendentes (para ver se travou tempo)
    const ps = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "estado='pendente'",
      '',
      20,
      0,
    )
    out.amostra = []
    for (const x of ps)
      out.amostra.push({
        q: String(x.get('created') || '').slice(5, 16),
        mot: String(x.get('motivo') || ''),
        tent: Number(x.get('tentativas') || 0),
      })
    out.amostra.sort(function (a, b) {
      return a.q < b.q ? -1 : 1
    })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
