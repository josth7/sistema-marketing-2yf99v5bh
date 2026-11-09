routerAdd(
  'GET',
  '/backend/v1/diag/apres-quando',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const col = $app.findCollectionByNameOrId('whatsapp_envios')
    const es = $app.findRecordsByFilter(col, "motivo='apresentacao_vendedor'", '', 200, 0)
    const porDia = {}
    var semLegenda = 0,
      comLegenda = 0
    for (const en of es) {
      const d = String(en.get('created') || '').slice(0, 10)
      porDia[d] = (porDia[d] || 0) + 1
      if (String(en.get('legenda') || '') === '') semLegenda++
      else comLegenda++
    }
    // conexoes com apresentacao ligada e modelo
    const cxs = $app.findRecordsByFilter(
      $app.findCollectionByNameOrId('whatsapp_conexoes'),
      'apresentacao_ativa=true',
      '',
      20,
      0,
    )
    const ligadas = []
    for (const c of cxs)
      ligadas.push({
        nome: String(c.get('nome_exibicao') || ''),
        modelo: String(c.get('modelo_apresentacao_vendedor') || ''),
      })
    return e.json(200, {
      total: es.length,
      por_dia: porDia,
      sem_legenda: semLegenda,
      com_legenda: comLegenda,
      ligadas: ligadas,
    })
  },
  $apis.requireAuth(),
)
