/**
 * Hooks do servidor (Skip Cloud) — job de ingestão (task ea514702).
 *
 * routerAdd registra:
 *   POST /api/ingest?fonte=meta_ads|google_ads  → executa a ingestão da fonte
 *
 * Regras da SPEC:
 * - timeout/retry no adaptador (meta.ts); falha NUNCA zera nem apaga dados (RN-06/07).
 * - última ingestão preservada: fontes_estado só atualiza quando a leitura tem sucesso;
 *   em falha, grava o estado do erro mantendo ultima_ingestao anterior.
 * - dedupe por índice único (origem, canal, campanha_id, data) → upsert idempotente.
 * - token lido de $secrets — nunca hardcoded, nunca logado.
 *
 * IMPORTANTE (transparência): os hooks rodam no runtime do Skip Cloud. Este arquivo
 * declara o contrato; se o runtime do projeto ainda não carregar hooks de ingestão,
 * o endpoint responde 501 e o painel continua funcionando em modo demonstração
 * (CA-1-08) — a limitação fica visível, não escondida.
 */

routerAdd(
  'POST',
  '/backend/v1/ingest',
  (e) => {
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

    // A chamada HTTP externa + upsert acontecem aqui no runtime do servidor.
    // Em runtime sem fetch externo habilitado, responde 501 sem alterar dados.
    if (typeof $http === 'undefined' || !$http || !$http.fetch) {
      return e.json(501, {
        ok: false,
        erro: 'runtime sem acesso HTTP externo — ingestão não executada; dados preservados',
      })
    }

    try {
      let rows = []
      if (fonte === 'meta_ads') {
        const res = $http.fetch(
          `https://graph.facebook.com/v21.0/act_${conta}/ads?fields=id,name,insights{impressions,clicks,spend}&limit=100`,
          { headers: { Authorization: 'Bearer ' + token } },
        )
        if (res.status() !== 200) {
          // Falha: registra estado do erro, preserva última ingestão (RN-07)
          atualizarEstadoFonte(
            e,
            fonte,
            'erro_autenticacao',
            'falha na leitura (HTTP ' + res.status() + ')',
            false,
          )
          return e.json(502, { ok: false, erro: 'Meta retornou HTTP ' + res.status(), ingested: 0 })
        }
        const json = JSON.parse(res.body())
        rows = extrairLinhasMeta(json)
      } else {
        // Google Ads: leitura via relatório de campanhas (credencial de serviço no servidor)
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
          atualizarEstadoFonte(
            e,
            fonte,
            'erro_api',
            'falha na leitura (HTTP ' + res.status() + ')',
            false,
          )
          return e.json(502, {
            ok: false,
            erro: 'Google retornou HTTP ' + res.status(),
            ingested: 0,
          })
        }
        rows = extrairLinhasGoogle(res.body())
      }

      // Upsert idempotente (índice único: origem, canal, campanha_id, data)
      const col = e.app.findCollectionByNameOrId('metricas_diarias')
      let gravados = 0
      const agora = new Date().toISOString()
      for (const r of rows) {
        if (!r.data) continue
        const filtro = {
          filter:
            "origem='api' && canal='" +
            fonte +
            "' && campanha_id='" +
            r.campanhaId +
            "' && data='" +
            r.data +
            "'",
        }
        const existentes = e.app.findRecordsByFilter('metricas_diarias', filtro.filter, '', 1, 0)
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
        rec.set('objetivo', r.objetivo || 'nao_informado')
        rec.set('data', r.data)
        if (r.impressoes !== null) rec.set('impressoes', r.impressoes)
        if (r.cliques !== null) rec.set('cliques', r.cliques)
        if (r.gasto !== null) rec.set('gasto', r.gasto)
        e.app.save(rec)
        gravados++
      }

      atualizarEstadoFonte(e, fonte, 'conectado', null, true)
      console.log(
        'ingestão ' + fonte + ': ' + gravados + ' registros (última ingestão ' + agora + ')',
      )
      return e.json(200, { ok: true, ingested: gravados, fonte: fonte })
    } catch (err) {
      atualizarEstadoFonte(e, fonte, 'erro_api', 'exceção na ingestão', false)
      return e.json(500, {
        ok: false,
        erro: 'ingestão falhou; dados anteriores preservados',
        detalhe: String(err).slice(0, 200),
      })
    }
  },
  null, // auth: endpoint interno chamado pelo painel autenticado
)

function atualizarEstadoFonte(e, canal, estado, aviso, sucesso) {
  try {
    const col = e.app.findCollectionByNameOrId('fontes_estado')
    const existentes = e.app.findRecordsByFilter('fontes_estado', "canal='" + canal + "'", '', 1, 0)
    let rec
    if (existentes && existentes.length > 0) {
      rec = e.app.findRecordById('fontes_estado', existentes[0].id)
    } else {
      rec = new Record(col)
      rec.set('canal', canal)
    }
    rec.set('estado', estado)
    if (aviso) rec.set('aviso', aviso)
    // RN-07: última ingestão só avança em sucesso — falha preserva a anterior
    if (sucesso) rec.set('ultima_ingestao', new Date().toISOString())
    e.app.save(rec)
  } catch (err) {
    console.log('falha ao atualizar fontes_estado: ' + String(err).slice(0, 120))
  }
}

function extrairLinhasMeta(json) {
  const linhas = []
  if (!json || !json.data) return linhas
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
        objetivo: 'nao_informado',
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
        objetivo: 'nao_informado',
      })
    }
  }
  return linhas
}

function extrairLinhasGoogle(body) {
  const linhas = []
  try {
    const json = JSON.parse(body)
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
            r.metrics && r.metrics.impressions !== undefined ? Number(r.metrics.impressions) : null,
          cliques: r.metrics && r.metrics.clicks !== undefined ? Number(r.metrics.clicks) : null,
          gasto:
            r.metrics && r.metrics.costMicros !== undefined
              ? Number(r.metrics.costMicros) / 1e6
              : null,
          objetivo: 'nao_informado',
        })
      }
    }
  } catch (err) {
    console.log('falha ao parsear resposta Google: ' + String(err).slice(0, 120))
  }
  return linhas
}
