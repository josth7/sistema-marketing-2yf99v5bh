/**
 * Job diário de ingestão da Meta (contrato E-11 / RN-10).
 *
 * cronAdd global, horário UTC: 0 9 * * * = 06:00 de Brasília.
 * Reprocessa os últimos 7 dias (atualiza em vez de duplicar).
 * Lógica INLINE (JSVM não vê declarações de top-level) e duplicada da rota
 * /backend/v1/ingest conforme orientação do guia de hooks do Skip.
 *
 * Sem rede em onBootstrap; chamadas só aqui, dentro do callback do cron.
 */

cronAdd('meta_ingestao_diaria', '0 9 * * *', () => {
  const fonte = 'meta_ads'
  const token = $secrets.get('META_ACCESS_TOKEN') || ''
  let conta = ($secrets.get('META_ACCOUNT_ID') || '').replace(/^act_/i, '')

  function gravarEstado(app, canal, estado, aviso, sucesso) {
    try {
      const colE = app.findCollectionByNameOrId('fontes_estado')
      const exE = app.findRecordsByFilter(colE, "canal='" + canal + "'", '', 1, 0)
      let recE
      if (exE && exE.length > 0) {
        recE = app.findRecordById(colE, exE[0].id)
      } else {
        recE = new Record(colE)
        recE.set('canal', canal)
      }
      recE.set('estado', estado)
      recE.set('aviso', aviso || '')
      if (sucesso) recE.set('ultima_ingestao', new Date().toISOString())
      app.save(recE)
    } catch (errE) {
      console.log('job: falha ao atualizar estado: ' + String(errE).slice(0, 120))
    }
  }

  if (!token || !conta) {
    gravarEstado(
      $app,
      fonte,
      'indisponivel',
      'segredo META_' + (token ? 'ACCOUNT_ID' : 'ACCESS_TOKEN') + ' não cadastrado (job diário)',
      false,
    )
    console.log('job meta: segredos ausentes — nada a fazer')
    return
  }

  try {
    const dias = []
    for (let i = 7; i >= 0; i--) {
      dias.push(new Date(Date.now() - i * 86400000).toISOString().slice(0, 10))
    }
    const since = dias[0]
    const until = dias[dias.length - 1]

    const urlInsights =
      'https://graph.facebook.com/v26.0/act_' +
      conta +
      '/insights' +
      '?level=campaign&time_increment=1' +
      '&time_range=' +
      encodeURIComponent(JSON.stringify({ since: since, until: until })) +
      '&fields=campaign_id,campaign_name,objective,spend,impressions,reach,clicks' +
      '&limit=100&access_token=' +
      encodeURIComponent(token)

    let linhas = []
    let urlAtual = urlInsights
    let paginas = 0
    while (urlAtual && paginas < 20) {
      const res = $http.send({ url: urlAtual, method: 'GET', timeout: 30 })
      if (res.statusCode !== 200) {
        const err = res.json && res.json.error ? res.json.error : {}
        const codigo = err.code || res.statusCode
        const fbtrace = err.fbtrace_id || ''
        gravarEstado(
          $app,
          fonte,
          codigo === 190 || codigo === 10 || codigo === 200 ? 'erro_autenticacao' : 'erro_api',
          'job diário: Meta retornou código ' + codigo + ' em ' + new Date().toISOString(),
          false,
        )
        console.log('job meta: falha código ' + codigo + (fbtrace ? ' fbtrace ' + fbtrace : ''))
        return
      }
      const json = res.json || {}
      for (const r of json.data || []) {
        if (!r || !r.campaign_id) continue
        linhas.push({
          campanhaId: String(r.campaign_id),
          campanhaNome: r.campaign_name || '',
          objetivo: r.objective || 'nao_informado',
          data: r.date_start || '',
          alcance: r.reach !== undefined && r.reach !== null ? Number(r.reach) : null,
          impressoes:
            r.impressions !== undefined && r.impressions !== null ? Number(r.impressions) : null,
          cliques: r.clicks !== undefined && r.clicks !== null ? Number(r.clicks) : null,
          gasto: r.spend !== undefined && r.spend !== null ? Number(r.spend) : null,
        })
      }
      paginas++
      urlAtual = json.paging && json.paging.next ? json.paging.next : null
    }

    const col = $app.findCollectionByNameOrId('metricas_diarias')
    let gravados = 0
    for (const r of linhas) {
      if (!r.data) continue
      const filtro = "origem='api' && canal='" + fonte + "' && campanha_id='" + r.campanhaId + "'"
      const candidatos = $app.findRecordsByFilter(col, filtro, '', 50, 0)
      let rec = null
      for (const c of candidatos) {
        if (String(c.get('data')).slice(0, 10) === r.data) {
          rec = $app.findRecordById(col, c.id)
          break
        }
      }
      if (!rec) {
        rec = new Record(col)
        rec.set('origem', 'api')
        rec.set('canal', fonte)
      }
      rec.set('natureza', 'pago')
      rec.set('conta_id', conta)
      rec.set('campanha_id', r.campanhaId)
      rec.set('campanha_nome', r.campanhaNome)
      rec.set('objetivo', r.objetivo || 'nao_informado')
      rec.set('data', r.data)
      if (r.alcance !== null && r.alcance !== undefined) rec.set('alcance', r.alcance)
      if (r.impressoes !== null && r.impressoes !== undefined) rec.set('impressoes', r.impressoes)
      if (r.cliques !== null && r.cliques !== undefined) rec.set('cliques', r.cliques)
      if (r.gasto !== null && r.gasto !== undefined) rec.set('gasto', r.gasto)
      $app.save(rec)
      gravados++
    }

    gravarEstado($app, fonte, 'conectado', '', true)
    console.log('job meta: ' + gravados + ' registros (reprocesso 7 dias)')
  } catch (err) {
    gravarEstado(
      $app,
      fonte,
      'erro_api',
      'job diário: exceção em ' + new Date().toISOString(),
      false,
    )
    console.log('job meta: exceção ' + String(err).slice(0, 160))
  }
})
