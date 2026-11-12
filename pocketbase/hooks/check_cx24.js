/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/cx24',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, por_conexao: [], com_ia_respondendo: 0 }
    const papel = {}
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      '',
      '',
      60,
      0,
    ))
      papel[c.id] = String(c.get('nome_exibicao') || '') + ' (' + String(c.get('papel') || '') + ')'
    const ms = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_mensagens'),
      "direcao='entrada' && created>='2026-11-12 19:05'",
      '',
      300,
      0,
    )
    const cnt = {}
    const tels = {}
    for (const m of ms) {
      const k = papel[String(m.get('conexao') || '')] || '?'
      cnt[k] = (cnt[k] || 0) + 1
      const t = String(m.get('contato_telefone') || '').slice(-6)
      if (!tels[k]) tels[k] = []
      if (tels[k].length < 3) tels[k].push(t)
    }
    for (const k in cnt) out.por_conexao.push({ conexao: k, msgs: cnt[k], exemplos: tels[k] })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
