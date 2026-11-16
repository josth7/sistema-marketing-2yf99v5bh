/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/apos-fix',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, lista: [] }
    // apresentacoes desde a correcao da legenda (13/11 19:00 UTC em diante)
    const envs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_envios'),
      "motivo='apresentacao_vendedor' && created>='2026-11-13 19:00'",
      '',
      100,
      0,
    )
    for (const x of envs)
      out.lista.push({
        q: String(x.get('created') || '').slice(5, 16),
        dest: String(x.get('destino_telefone') || '').slice(-6),
        est: String(x.get('estado') || ''),
        erro: String(x.get('ultimo_erro') || '').slice(0, 50),
        leg: String(x.get('legenda') || '(VAZIO)').slice(0, 30),
      })
    out.lista.sort(function (a, b) {
      return a.q < b.q ? -1 : 1
    })
    out.total = envs.length
    out.com_legenda = 0
    for (const x of out.lista) if (x.leg !== '(VAZIO)') out.com_legenda++
    out.enviadas = 0
    for (const x of out.lista) if (x.est === 'enviado') out.enviadas++
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
