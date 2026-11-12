/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/min',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true }
    const cs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true && fixture=false",
      '',
      1,
      0,
    )
    if (cs.length > 0) {
      const c = cs[0]
      out.central = {
        nome: String(c.get('nome_exibicao') || ''),
        sess: String(c.get('session_id') || '').slice(0, 22),
        ultimo_evento: String(c.get('ultimo_evento_em') || '').slice(0, 19),
        ultimo_status: String(c.get('ultimo_status_conexao') || ''),
      }
    }
    const m = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "direcao='entrada' && created>='2026-11-12 17:00'",
      '',
      50,
      0,
    )
    var ultima = ''
    for (const x of m) {
      const q = String(x.get('created') || '')
      if (q > ultima) ultima = q
    }
    out.ultima_entrada = ultima.slice(0, 19)
    out.entradas_desde_14h = m.length
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
