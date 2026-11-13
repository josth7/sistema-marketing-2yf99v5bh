/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/d15',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
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
      centrais[c.id] = 1
    var alvo = null
    for (const c of cvs) if (centrais[String(c.get('conexao') || '')]) alvo = c
    if (!alvo) return e.json(200, { ok: false })
    const out = {
      ok: true,
      canal: String(alvo.get('canal') || '(vazio)'),
      etapa: String(alvo.get('etapa_atual') || ''),
      estado: String(alvo.get('estado') || ''),
      anuncio_id: String(alvo.get('anuncio_id') || ''),
      anuncio_url: String(alvo.get('anuncio_url') || ''),
      origem: String(alvo.get('origem') || ''),
    }
    // o lead
    const lid = String(alvo.get('lead') || '')
    if (lid !== '')
      try {
        const l = app.findRecordById('crm_leads', lid)
        out.lead = {
          origem: String(l.get('origem') || ''),
          anuncio: String(l.get('anuncio_id') || ''),
          status: String(l.get('status') || ''),
          dono: String(l.get('owner_id') || '').slice(0, 10),
        }
      } catch (e1) {}
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
