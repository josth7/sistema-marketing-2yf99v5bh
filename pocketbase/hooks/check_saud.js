/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/saudacao-6170',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, agora_utc: new Date().toISOString().slice(0, 19) }
    // 1. avisos ao cliente com wa.me desde ontem (as frases que o cron procura)
    try {
      const av = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        "motivo='aviso_cliente' && created>='2026-11-12 18:00'",
        '',
        200,
        0,
      )
      out.avisos = av.length
      out.com_wame = 0
      out.detalhes = []
      for (const x of av) {
        const t = String(x.get('texto') || '')
        const tem = t.indexOf('wa.me/') >= 0
        if (tem) out.com_wame++
        if (out.detalhes.length < 8)
          out.detalhes.push({
            q: String(x.get('created') || '').slice(5, 16),
            dest: String(x.get('destino_telefone') || '').slice(-6),
            wame: tem,
            lead: String(x.get('lead') || '').slice(0, 10),
          })
      }
    } catch (e1) {
      out.erro1 = String(e1).slice(0, 80)
    }
    // 2. apresentacoes enfileiradas/erro desde ontem
    try {
      const ap = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_envios'),
        "motivo='apresentacao_vendedor' && created>='2026-11-12 18:00'",
        '',
        100,
        0,
      )
      out.apres_total = ap.length
      out.apres = []
      for (const x of ap)
        out.apres.push({
          q: String(x.get('created') || '').slice(5, 16),
          dest: String(x.get('destino_telefone') || '').slice(-6),
          est: String(x.get('estado') || ''),
          erro: String(x.get('ultimo_erro') || '').slice(0, 40),
        })
    } catch (e2) {}
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
