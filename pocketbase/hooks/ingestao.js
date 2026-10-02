/**
 * Hooks do servidor (Skip Cloud) — job de ingestão (task ea514702).
 *
 * Rota: POST /backend/v1/ingest?fonte=meta_ads|google_ads
 *
 * Regras da SPEC:
 * - timeout/retry no adaptador; falha NUNCA zera nem apaga dados (RN-06/07).
 * - última ingestão preservada: fontes_estado só avança em sucesso.
 * - dedupe por índice único (origem, canal, campanha_id, data) → upsert idempotente.
 * - token lido de $secrets — nunca hardcoded, nunca logado.
 *
 * IMPORTANTE (JSVM): toda a lógica fica INLINE no callback — PocketBase executa
 * callbacks em VM separada, funções de top-level não são visíveis lá.
 */

routerAdd('POST', '/backend/v1/ingest', (e) => {
  const fonte = e.request.url.query().get('fonte') || ''
  if (fonte !== 'meta_ads' && fonte !== 'google_ads') {
    return e.json(400, { ok: false, erro: 'fonte inválida: use meta_ads ou google_ads' })
  }

  let token = ''
  let conta = ''
  if (fonte === 'meta_ads') {
    token = $secrets.get('META_ACCESS_TOKEN') || ''
    conta = $secrets.get('META_ACCOUNT_ID') || ''
    if (!token || !conta) {
      return e.json(501, {
        ok: false,
        erro: 'ingestão Meta não configurada: defina META_ACCESS_TOKEN e META_ACCOUNT_ID nos segredos do projeto',
      })
    }
  } else {
    token = $secrets.get('GOOGLE_ADS_TOKEN') || ''
    conta = $secrets.get('GOOGLE_ADS_CUSTOMER_ID') || ''
    if (!token || !conta) {
      return e.json(501, {
        ok: false,
        erro: 'ingestão Google não configurada: defina GOOGLE_ADS_TOKEN e GOOGLE_ADS_CUSTOMER_ID nos segredos do projeto',
      })
    }
  }

  if (typeof $http === 'undefined' || !$http || !$http.fetch) {
    return e.json(501, {
      ok: false,
      erro: 'runtime sem acesso HTTP externo — ingestão não executada; dados preservados',
    })
  }

  try {
    // ---- extração INLINE (JSVM: sem funções de top-level) ----
    let linhas = []
    if (fonte === 'meta_ads') {
      const res = $http.fetch(
        'https://graph.facebook.com/v21.0/act_' +
          conta +
          '/ads?fields=id,name,insights{impressions,clicks,spend}&limit=100',
        { headers: { Authorization: 'Bearer ' + token } },
      )
      if (res.status() !== 200) {
        // RN-07: registra o erro, preserva última ingestão
        try {
          const colE = e.app.findCollectionByNameOrId('fontes_estado')
          const exE = e.app.findRecordsByFilter('fontes_estado', "canal='" + fonte + "'", '', 1, 0)
          let recE
          if (exE && exE.length > 0) {
            recE = e.app.findRecordById('fontes_estado', exE[0].id)
          } else {
            recE = new Record(colE)
            recE.set('canal', fonte)
          }
          recE.set('estado', 'erro_autenticacao')
          recE.set(
            'aviso',
            'falha na leitura (HTTP ' + res.status() + ') em ' + new Date().toISOString(),
          )
          e.app.save(recE)
        } catch (errE) {
          console.log('falha ao atualizar estado: ' + String(errE).slice(0, 120))
        }
        return e.json(502, { ok: false, erro: 'Meta retornou HTTP ' + res.status(), ingested: 0 })
      }
      const json = JSON.parse(res.body())
      if (json && json.data) {
        for (const ad of json.data) {
          if (!ad || !ad.id) continue
          const ins = ad.insights && ad.insights.data ? ad.insights.data : []
          if (!ins.length) {
            linhas.push({
              campanhaId: ad.id,
              campanhaNome: ad.name || '',
              data: '',
              impressoes: null,
              cliques: null,
              gasto: null,
            })
            continue
          }
          for (const i of ins) {
            linhas.push({
              campanhaId: ad.id,
              campanhaNome: ad.name || '',
              data: i.date_start || '',
              impressoes: i.impressions !== undefined ? Number(i.impressions) : null,
              cliques: i.clicks !== undefined ? Number(i.clicks) : null,
              gasto: i.spend !== undefined ? Number(i.spend) : null,
            })
          }
        }
      }
    } else {
      const res = $http.fetch(
        'https://googleads.googleapis.com/v21/customers/' +
          conta.replace(/-/g, '') +
          '/googleAds:searchStream',
        {
          method: 'POST',
          headers: {
            Authorization: 'Bearer ' + token,
            'Content-Type': 'application/json',
            'developer-token': $secrets.get('GOOGLE_ADS_DEVELOPER_TOKEN') || '',
          },
          body: JSON.stringify({
            query:
              'SELECT campaign.id, campaign.name, campaign.status, metrics.impressions, metrics.clicks, metrics.cost_micros, metrics.conversions FROM campaign WHERE segments.date DURING LAST_30_DAYS',
          }),
        },
      )
      if (res.status() !== 200) {
        try {
          const colE = e.app.findCollectionByNameOrId('fontes_estado')
          const exE = e.app.findRecordsByFilter('fontes_estado', "canal='" + fonte + "'", '', 1, 0)
          let recE
          if (exE && exE.length > 0) {
            recE = e.app.findRecordById('fontes_estado', exE[0].id)
          } else {
            recE = new Record(colE)
            recE.set('canal', fonte)
          }
          recE.set('estado', 'erro_api')
          recE.set(
            'aviso',
            'falha na leitura (HTTP ' + res.status() + ') em ' + new Date().toISOString(),
          )
          e.app.save(recE)
        } catch (errE) {
          console.log('falha ao atualizar estado: ' + String(errE).slice(0, 120))
        }
        return e.json(502, {
          ok: false,
          erro: 'Google retornou HTTP ' + res.status(),
          ingested: 0,
        })
      }
      const json = JSON.parse(res.body())
      const batches = Array.isArray(json) ? json : [json]
      for (const batch of batches) {
        if (!batch || !batch.results) continue
        for (const r of batch.results) {
          if (!r.campaign || r.campaign.id === undefined) continue
          linhas.push({
            campanhaId: String(r.campaign.id),
            campanhaNome: r.campaign.name || '',
            data: new Date().toISOString().slice(0, 10),
            impressoes:
              r.metrics && r.metrics.impressions !== undefined
                ? Number(r.metrics.impressions)
                : null,
            cliques: r.metrics && r.metrics.clicks !== undefined ? Number(r.metrics.clicks) : null,
            gasto:
              r.metrics && r.metrics.costMicros !== undefined
                ? Number(r.metrics.costMicros) / 1e6
                : null,
          })
        }
      }
    }

    // ---- upsert idempotente (índice único: origem, canal, campanha_id, data) ----
    const col = e.app.findCollectionByNameOrId('metricas_diarias')
    let gravados = 0
    for (const r of linhas) {
      if (!r.data) continue
      const filtro =
        "origem='api' && canal='" +
        fonte +
        "' && campanha_id='" +
        r.campanhaId +
        "' && data='" +
        r.data +
        "'"
      const existentes = e.app.findRecordsByFilter('metricas_diarias', filtro, '', 1, 0)
      let rec
      if (existentes && existentes.length > 0) {
        rec = e.app.findRecordById('metricas_diarias', existentes[0].id)
      } else {
        rec = new Record(col)
        rec.set('origem', 'api')
        rec.set('canal', fonte)
      }
      rec.set('natureza', 'pago')
      rec.set('conta_id', conta)
      rec.set('campanha_id', r.campanhaId)
      rec.set('campanha_nome', r.campanhaNome)
      rec.set('objetivo', 'nao_informado')
      rec.set('data', r.data)
      if (r.impressoes !== null) rec.set('impressoes', r.impressoes)
      if (r.cliques !== null) rec.set('cliques', r.cliques)
      if (r.gasto !== null) rec.set('gasto', r.gasto)
      e.app.save(rec)
      gravados++
    }

    // RN-07: última ingestão só avança em sucesso
    try {
      const colE = e.app.findCollectionByNameOrId('fontes_estado')
      const exE = e.app.findRecordsByFilter('fontes_estado', "canal='" + fonte + "'", '', 1, 0)
      let recE
      if (exE && exE.length > 0) {
        recE = e.app.findRecordById('fontes_estado', exE[0].id)
      } else {
        recE = new Record(colE)
        recE.set('canal', fonte)
      }
      recE.set('estado', 'conectado')
      recE.set('aviso', '')
      recE.set('ultima_ingestao', new Date().toISOString())
      e.app.save(recE)
    } catch (errE) {
      console.log('falha ao atualizar estado: ' + String(errE).slice(0, 120))
    }

    console.log('ingestão ' + fonte + ': ' + gravados + ' registros')
    return e.json(200, { ok: true, ingested: gravados, fonte: fonte })
  } catch (err) {
    return e.json(500, {
      ok: false,
      erro: 'ingestão falhou; dados anteriores preservados',
      detalhe: String(err).slice(0, 200),
    })
  }
})
