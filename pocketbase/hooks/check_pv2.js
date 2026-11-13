/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/pv',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true }
    const cvs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conversas'),
      "contato_telefone~'9036170'",
      '',
      10,
      0,
    )
    const centrais = {}
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true && fixture=false",
      '',
      5,
      0,
    ))
      centrais[c.id] = true
    out.conversas = []
    for (const cv of cvs)
      out.conversas.push({
        papel: centrais[String(cv.get('conexao') || '')] ? 'central' : 'vendedor',
        estado: String(cv.get('estado') || ''),
        autor: String(cv.get('ultimo_autor') || ''),
        ia: String(cv.get('ultima_resposta_ia_em') || '').slice(0, 16),
        msgs: Number(cv.get('total_mensagens') || 0),
      })
    // o robo esta ligado?
    const emp = (function () {
      const cs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true && fixture=false",
        '',
        1,
        0,
      )
      return cs.length ? String(cs[0].get('empresa') || '') : ''
    })()
    const vs = app.findRecordsByFilter(
      'atendimento_config',
      emp !== '' ? "empresa='" + emp + "'" : '',
      '',
      200,
      0,
    )
    var cfg = null
    for (const v of vs) {
      if (!cfg || Number(v.get('versao') || 0) > Number(cfg.get('versao') || 0)) cfg = v
    }
    out.robo = cfg
      ? { versao: Number(cfg.get('versao')), ligado: cfg.get('ligado') === true }
      : null
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
