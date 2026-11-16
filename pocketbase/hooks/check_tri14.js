/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/triagem14',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, agora: new Date().toISOString().slice(0, 19), casos: [] }
    var central = null
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true && fixture=false",
      '',
      1,
      0,
    ))
      central = c
    if (!central) return e.json(200, { ok: false })
    const cfg = app.findRecordsByFilter(
      'atendimento_config',
      "empresa='" + String(central.get('empresa') || '') + "'",
      '',
      200,
      0,
    )
    var maior = -1,
      janela = 720
    for (const v of cfg) {
      const n = Number(v.get('versao') || 0)
      if (n > maior) {
        maior = n
        janela = Number(v.get('janela_min') || 720)
      }
    }
    out.janela_min = janela
    const cvs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conversas'),
      "conexao='" + central.id + "' && estado='triagem'",
      '',
      200,
      0,
    )
    out.total = cvs.length
    const agora = new Date().getTime()
    for (const c of cvs) {
      const q = new Date(String(c.get('ultima_mensagem_em') || c.get('created') || '')).getTime()
      const horas = q > 0 ? (agora - q) / 3600000 : 9999
      out.casos.push({
        tel: String(c.get('contato_telefone') || '').slice(-6),
        horas: Math.round(horas),
        autor: String(c.get('ultimo_autor') || ''),
        etapa: String(c.get('etapa_atual') || ''),
        msgs: Number(c.get('total_mensagens') || 0),
        ia: String(c.get('ultima_resposta_ia_em') || '').slice(11, 19),
        recente: horas * 60 <= janela,
      })
    }
    out.casos.sort(function (a, b) {
      return a.horas - b.horas
    })
    out.recentes = 0
    for (const c of out.casos) if (c.recente) out.recentes++
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
