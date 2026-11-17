/// <reference path="../pb_data/types.d.ts" />
routerAdd(
  'GET',
  '/backend/v1/check/verif-final',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, divergentes_restantes: 0, lista: [] }
    const nomePorUser = {}
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      "papel='vendedor' && ativo=true && fixture=false",
      '',
      30,
      0,
    )) {
      const uid = String(c.get('vendedor_user') || '')
      if (uid !== '') nomePorUser[uid] = String(c.get('nome_exibicao') || '')
    }
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
    const cvs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conversas'),
      "conexao='" + central.id + "' && estado='transferida' && fixture=false",
      '',
      3000,
      0,
    )
    const norm = function (s) {
      return String(s)
        .toLowerCase()
        .replace(/silva|santos|teles|renato/g, '')
        .replace(/[^a-z]/g, '')
    }
    for (const cv of cvs) {
      const tel = String(cv.get('contato_telefone') || '')
      const lid = String(cv.get('lead') || '')
      if (lid === '') continue
      var lead = null
      try {
        lead = app.findRecordById('crm_leads', lid)
      } catch (e1) {
        continue
      }
      const dono = nomePorUser[String(lead.get('owner_id') || '')] || ''
      var aviso = ''
      try {
        const envs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_envios'),
          "destino_telefone='" + tel + "' && motivo='aviso_cliente'",
          '-created',
          3,
          0,
        )
        if (envs.length > 0) aviso = String(envs[0].get('texto') || '')
      } catch (e2) {}
      if (aviso === '') continue
      var prometido = ''
      const m = aviso.match(/Quem vai te atender é \*([^*]+)\*/)
      if (m) prometido = m[1].trim()
      if (prometido === '' || dono === '') continue
      if (norm(prometido) !== norm(dono)) {
        out.divergentes_restantes++
        if (out.lista.length < 10)
          out.lista.push({ tel: tel.slice(-6), prometido: prometido, dono: dono })
      }
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
