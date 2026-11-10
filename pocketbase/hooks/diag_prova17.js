routerAdd(
  'GET',
  '/backend/v1/diag/prova-17',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })
    const app = $app
    const out = { ok: true, passos: [] }
    // 1. robo ligado?
    var cfg = null
    try {
      const vs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('atendimento_config'),
        '',
        '',
        200,
        0,
      )
      for (const v of vs) {
        if (!cfg || Number(v.get('versao') || 0) > Number(cfg.get('versao') || 0)) cfg = v
      }
    } catch (e1) {}
    out.passos.push({
      passo: '1. robo ligado na central',
      ok: cfg ? cfg.get('ativo') === true : false,
      detalhe: 'versao ' + (cfg ? cfg.get('versao') : '?'),
    })
    // 2. apresentacao desligada nos vendedores?
    var ligados = 0,
      total = 0
    try {
      const cs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor' && ativo=true",
        '',
        30,
        0,
      )
      for (const c of cs) {
        if (
          String(c.get('nome_exibicao') || '')
            .toLowerCase()
            .indexOf('fixture') >= 0
        )
          continue
        total++
        if (c.get('apresentacao_ativa') === true) ligados++
      }
    } catch (e2) {}
    out.passos.push({
      passo: '2. apresentacao DESLIGADA nos vendedores',
      ok: ligados === 0,
      detalhe: ligados + ' ligados de ' + total,
    })
    // 3. conversas em triagem sao so da central?
    var tri = 0,
      triVend = 0
    try {
      const convs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "estado='triagem' && fixture=false",
        '',
        3000,
        0,
      )
      const cxP = {}
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        '',
        '',
        60,
        0,
      ))
        cxP[c.id] = String(c.get('papel') || '')
      for (const cv of convs) {
        tri++
        if (cxP[String(cv.get('conexao') || '')] !== 'central') triVend++
      }
    } catch (e3) {}
    out.passos.push({
      passo: '3. IA so na central (0 em vendedor)',
      ok: triVend === 0,
      detalhe: tri + ' em triagem, ' + triVend + ' em numero de vendedor',
    })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
