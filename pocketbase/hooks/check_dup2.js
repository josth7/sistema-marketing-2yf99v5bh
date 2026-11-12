routerAdd(
  'GET',
  '/backend/v1/check/duplicadas',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const cvs = app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conversas'),
      '',
      '',
      5000,
      0,
    )
    const papel = {}
    for (const c of app.findRecordsByFilter(
      app.findCollectionByNameOrId('whatsapp_conexoes'),
      '',
      '',
      60,
      0,
    ))
      papel[c.id] = String(c.get('papel') || '')
    const porTel = {}
    for (const c of cvs) {
      const t = String(c.get('contato_telefone') || '')
      if (t === '') continue
      if (!porTel[t]) porTel[t] = []
      porTel[t].push({
        papel: papel[String(c.get('conexao') || '')] || '?',
        estado: String(c.get('estado') || ''),
        id: c.id.slice(0, 8),
      })
    }
    const dup = []
    for (const t in porTel) {
      const lst = porTel[t]
      if (lst.length > 1) {
        var temCentral = false,
          temVend = false,
          triagem = false
        for (const x of lst) {
          if (x.papel === 'central') temCentral = true
          if (x.papel === 'vendedor') temVend = true
          if (x.estado === 'triagem') triagem = true
        }
        if (temCentral && temVend)
          dup.push({ tel: t.slice(-6), conversas: lst.length, triagem: triagem, det: lst })
      }
    }
    return e.json(200, {
      total_dup: dup.length,
      com_triagem: dup.filter(function (x) {
        return x.triagem
      }).length,
      amostra: dup.slice(0, 5),
    })
  },
  $apis.requireAuth(),
)
