/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/prep9156',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const ex = String(e.request.url.query().get('executar') || '') === '1'
    const out = { ok: true, executar: ex, antes: [], feito: '' }
    const centrais = {}
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='central' && ativo=true && fixture=false",
      '',
      5,
      0,
    ))
      centrais[c.id] = 1
    const cvs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conversas'),
      "contato_telefone~'91562937'",
      '',
      10,
      0,
    )
    for (const cv of cvs) {
      const ehCentral = centrais[String(cv.get('conexao') || '')] === 1
      out.antes.push({
        papel: ehCentral ? 'central' : 'vendedor',
        estado: String(cv.get('estado') || ''),
        etapa: String(cv.get('etapa_atual') || ''),
        msgs: Number(cv.get('total_mensagens') || 0),
      })
      if (ex && ehCentral) {
        try {
          cv.set('estado', 'triagem')
          cv.set('pausada_motivo', '')
          cv.set('pausada_em', '')
          cv.set('etapa_atual', '')
          try {
            cv.set('ultima_resposta_ia_em', '')
          } catch (x) {}
          cv.set('ultimo_autor', 'cliente')
          app.save(cv)
          out.feito = 'central devolvida para triagem, etapa limpa, IA zerada'
        } catch (e1) {
          out.erro = String(e1).slice(0, 100)
        }
      }
    }
    // o lead dele
    try {
      const l = app.findRecordsByFilter(
        app.findCollectionByNameOrId('crm_leads'),
        "telefone~'91562937'",
        '',
        5,
        0,
      )
      out.leads = []
      for (const x of l) {
        var dono = ''
        try {
          dono = String(app.findRecordById('users', String(x.get('owner_id'))).get('name') || '')
        } catch (e2) {}
        out.leads.push({
          nome: String(x.get('nome') || ''),
          status: String(x.get('status') || ''),
          dono: dono,
        })
      }
    } catch (e3) {}
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
