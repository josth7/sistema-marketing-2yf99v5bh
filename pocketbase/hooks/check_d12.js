/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/d12',
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
      centrais[c.id] = 1
    var alvo = null
    for (const c of cvs) if (centrais[String(c.get('conexao') || '')]) alvo = c
    if (!alvo) return e.json(200, { ok: false })
    // TODOS os campos que podem travar
    const campos = {}
    const det = app.findCollectionByNameOrId('whatsapp_conversas')
    for (const f of det.fields || []) {
      const n = String(f.name)
      if (
        n === 'estado' ||
        n === 'ultimo_autor' ||
        n.indexOf('ia_') === 0 ||
        n.indexOf('pausa') >= 0 ||
        n.indexOf('etapa') >= 0 ||
        n.indexOf('roteiro') >= 0 ||
        n.indexOf('handoff') >= 0 ||
        n.indexOf('bot') >= 0
      ) {
        campos[n] = String(alvo.get(n) || '')
      }
    }
    out.campos = campos
    // o lead tem dono? (se transferiu, o robo pode ter saido)
    const lid = String(alvo.get('lead') || '')
    if (lid !== '') {
      try {
        const l = app.findRecordById('crm_leads', lid)
        out.lead = {
          nome: String(l.get('nome') || ''),
          status: String(l.get('status') || ''),
          dono: String(l.get('owner_id') || '').slice(0, 10),
        }
      } catch (e1) {}
    }
    // houve pedido de transferencia para esse lead?
    if (lid !== '') {
      try {
        const tr = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_transferencias'),
          "lead='" + lid + "'",
          '',
          5,
          0,
        )
        out.transferencias = []
        for (const t of tr)
          out.transferencias.push({
            estado: String(t.get('estado') || ''),
            vendedor: String(t.get('vendedor_nome') || ''),
            q: String(t.get('created') || '').slice(11, 19),
          })
      } catch (e2) {}
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
