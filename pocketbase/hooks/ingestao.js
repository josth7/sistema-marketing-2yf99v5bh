/**
 * Hooks do servidor (Skip Cloud) — job de ingestão (tasks ea514702 + 116061e0).
 *
 * Rota: POST /backend/v1/ingest?fonte=meta_ads|google_ads
 *
 * Contrato E-10/E-11 (06_notas/contrato-meta.md):
 * - Meta lida DIRETO pela Graph API v26.0 com token de usuário do sistema
 *   (segredos META_ACCESS_TOKEN + META_ACCOUNT_ID, gravados pela Haisan).
 * - Insights no NÓ DA CONTA (act_<id>/insights com level=campaign, time_increment=1);
 *   insights como campo de outro objeto gera erro #100 (visto 02/10).
 * - RN-09: conferência de permissões via GET me/permissions (só nomes, sem token).
 * - Google segue no Composio (segredos GOOGLE_ADS_*).
 * - Erro 10/200 ("API access blocked") → parar fonte, registrar código + fbtrace_id,
 *   acionar consultoria, sem reconectar em série (contrato §5).
 * - RN-06/07: falha NUNCA zera nem apaga dados; última ingestão só avança em sucesso.
 * - JSVM: toda a lógica INLINE no callback; $http.send (não $http.fetch — não existe);
 *   res.statusCode (não res.status()); res.json (não res.body()).
 */

routerAdd('POST', '/backend/v1/ingest', (e) => {
  const fonte = e.request.url.query().get('fonte') || ''
  if (fonte !== 'meta_ads' && fonte !== 'google_ads') {
    return e.json(400, { ok: false, erro: 'fonte inválida: use meta_ads ou google_ads' })
  }

  // ---- atualiza fontes_estado (inline, RN-07) ----
  // estado: conectado | erro_autenticacao | erro_api | indisponivel
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
      console.log('falha ao atualizar estado: ' + String(errE).slice(0, 120))
    }
  }

  // ---- segredos por fonte (nomes fixos do contrato) ----
  let token = ''
  let conta = ''
  if (fonte === 'meta_ads') {
    token = $secrets.get('META_ACCESS_TOKEN') || ''
    conta = $secrets.get('META_ACCOUNT_ID') || ''
    conta = conta.replace(/^act_/i, '') // normaliza (contrato: aceita com ou sem act_)
    if (!token || !conta) {
      gravarEstado(
        e.app,
        fonte,
        'indisponivel',
        'segredo META_' + (token ? 'ACCOUNT_ID' : 'ACCESS_TOKEN') + ' não cadastrado',
        false,
      )
      return e.json(501, {
        ok: false,
        erro: 'ingestão Meta indisponível: cadastre META_ACCESS_TOKEN e META_ACCOUNT_ID (só números) no painel de segredos do Skip',
      })
    }
  }
  // Google (E-12): SEM segredos — os dados chegam no corpo da rota, enviados
  // pelo Maestro (conector Composio). Nenhuma credencial GOOGLE_* no Skip.

  try {
    let linhas = []
    let avisoOrganico = ''

    if (fonte === 'meta_ads') {
      // ---- RN-09: conferência de permissões (só nomes, sem expor token) ----
      const resPerm = $http.send({
        url:
          'https://graph.facebook.com/v26.0/me/permissions?access_token=' +
          encodeURIComponent(token),
        method: 'GET',
        timeout: 30,
      })
      if (resPerm.statusCode !== 200) {
        const permErr = resPerm.json && resPerm.json.error ? resPerm.json.error : {}
        const codigo = permErr.code || resPerm.statusCode
        const fbtrace = permErr.fbtrace_id || ''
        gravarEstado(
          e.app,
          fonte,
          'erro_autenticacao',
          'falha na conferência de permissões (código ' +
            codigo +
            ') em ' +
            new Date().toISOString(),
          false,
        )
        // 10/200 = bloqueio de plataforma → acionar consultoria (contrato §5)
        return e.json(502, {
          ok: false,
          erro:
            'Meta rejeitou a conferência de permissões (código ' +
            codigo +
            ')' +
            (fbtrace ? ' · fbtrace ' + fbtrace : ''),
          acao:
            codigo === 10 || codigo === 200
              ? 'acionar consultoria (bloqueio de plataforma); não reconectar em série'
              : 'conferir o token no segredo META_ACCESS_TOKEN (uma nova tentativa)',
          ingested: 0,
        })
      }

      // ---- insights no NÓ DA CONTA (contrato: level=campaign, time_increment=1) ----
      // Reprocesso os últimos 7 dias (RN-10)
      const dias = []
      for (let i = 7; i >= 0; i--) {
        const d = new Date(Date.now() - i * 86400000)
        dias.push(d.toISOString().slice(0, 10))
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

      let urlAtual = urlInsights
      let paginas = 0
      while (urlAtual && paginas < 20) {
        const res = $http.send({ url: urlAtual, method: 'GET', timeout: 30 })
        if (res.statusCode !== 200) {
          const err = res.json && res.json.error ? res.json.error : {}
          const codigo = err.code || res.statusCode
          const fbtrace = err.fbtrace_id || ''
          const msg = err.message || ''
          if (codigo === 190 || codigo === 10 || codigo === 200) {
            gravarEstado(
              e.app,
              fonte,
              'erro_autenticacao',
              'Meta rejeitou a leitura (código ' + codigo + ') em ' + new Date().toISOString(),
              false,
            )
            return e.json(502, {
              ok: false,
              erro:
                'Meta rejeitou a leitura (código ' +
                codigo +
                (msg ? ': ' + String(msg).slice(0, 120) : '') +
                ')' +
                (fbtrace ? ' · fbtrace ' + fbtrace : ''),
              acao:
                codigo === 10 || codigo === 200
                  ? 'acionar consultoria (bloqueio de plataforma); não reconectar em série'
                  : 'conferir o token no segredo META_ACCESS_TOKEN (uma nova tentativa)',
              ingested: 0,
            })
          }
          gravarEstado(
            e.app,
            fonte,
            'erro_api',
            'Meta retornou código ' + codigo + ' em ' + new Date().toISOString(),
            false,
          )
          return e.json(502, {
            ok: false,
            erro: 'Meta retornou código ' + codigo + (fbtrace ? ' · fbtrace ' + fbtrace : ''),
            ingested: 0,
          })
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

      // ---- orgânico: página + Instagram via me/accounts (token da página só em memória) ----
      try {
        const resAcc = $http.send({
          url:
            'https://graph.facebook.com/v26.0/me/accounts?fields=id,name,access_token,instagram_business_account&access_token=' +
            encodeURIComponent(token),
          method: 'GET',
          timeout: 30,
        })
        if (resAcc.statusCode === 200) {
          const accs = (resAcc.json && resAcc.json.data) || []
          for (const acc of accs) {
            const pageToken = acc.access_token || ''
            if (acc.id && pageToken) {
              // métricas vigentes (contrato §4: page_impressions* removidas)
              const resPage = $http.send({
                url:
                  'https://graph.facebook.com/v26.0/' +
                  acc.id +
                  '/insights?metric=page_media_view,page_total_media_view_unique,page_follows&period=day&since=' +
                  since +
                  '&until=' +
                  until +
                  '&access_token=' +
                  encodeURIComponent(pageToken),
                method: 'GET',
                timeout: 30,
              })
              if (resPage.statusCode === 200) {
                const pIns = (resPage.json && resPage.json.data) || []
                let seguidores = null
                let visualizacoes = null
                for (const m of pIns) {
                  const vals = (m.values || []).filter(function (v) {
                    return v && v.value !== undefined && v.value !== null && Number(v.value) > 0
                  })
                  if (!vals.length) continue
                  const soma = vals.reduce(function (a, v) {
                    return a + Number(v.value)
                  }, 0)
                  if (m.name === 'page_follows') seguidores = soma
                  if (m.name === 'page_media_view' || m.name === 'page_total_media_view_unique') {
                    visualizacoes = (visualizacoes || 0) + soma
                  }
                }
                // RN-06: sem métricas reais (>0), não gravar linha vazia — evita zero falso
                if (seguidores !== null || visualizacoes !== null) {
                  linhas.push({
                    campanhaId: 'page_' + acc.id,
                    campanhaNome: 'Orgânico — ' + (acc.name || 'Página Meta'),
                    objetivo: 'organico',
                    data: until,
                    alcance: null,
                    impressoes: null,
                    cliques: null,
                    gasto: null,
                    resultados: null,
                    seguidores: seguidores,
                    visualizacoes: visualizacoes,
                  })
                }
              } else {
                avisoOrganico = 'página sem insights (HTTP ' + resPage.statusCode + ')'
              }
            }
            // Instagram (métricas vigentes: views, reach — impressions/plays removidas)
            const ig = acc.instagram_business_account
            if (ig && ig.id && pageToken) {
              const resIg = $http.send({
                url:
                  'https://graph.facebook.com/v26.0/' +
                  ig.id +
                  '/insights?metric=views,reach&metric_type=total_value&period=day&since=' +
                  since +
                  '&until=' +
                  until +
                  '&access_token=' +
                  encodeURIComponent(pageToken),
                method: 'GET',
                timeout: 30,
              })
              if (resIg.statusCode === 200) {
                const iIns = (resIg.json && resIg.json.data) || []
                let views = null
                let alcance = null
                for (const m of iIns) {
                  const vals = (m.values || []).filter(function (v) {
                    return v && v.value !== undefined && v.value !== null && Number(v.value) > 0
                  })
                  if (!vals.length) continue
                  const soma = vals.reduce(function (a, v) {
                    return a + Number(v.value)
                  }, 0)
                  if (m.name === 'views') views = soma
                  if (m.name === 'reach') alcance = soma
                }
                // RN-06: sem métricas reais (>0), não gravar linha vazia — evita zero falso
                if (views !== null || alcance !== null) {
                  linhas.push({
                    campanhaId: 'ig_' + ig.id,
                    campanhaNome: 'Orgânico — Instagram @haisanmoveis',
                    objetivo: 'organico',
                    data: until,
                    alcance: alcance,
                    impressoes: null,
                    cliques: null,
                    gasto: null,
                    resultados: null,
                    seguidores: null,
                    visualizacoes: views,
                  })
                }
              }
            }
          }
        }
      } catch (errOrg) {
        avisoOrganico = 'orgânico indisponível nesta rodada (' + String(errOrg).slice(0, 80) + ')'
      }
    } else {
      // ---- Google Ads RECEBIDO do conector do Maestro (emenda E-12) ----
      // O Google NÃO é chamado daqui (proibido pela E-12): o Maestro lê a conta
      // 962-453-3125 pelo Composio e envia as linhas no CORPO desta rota.
      // Nenhuma credencial GOOGLE_* no Skip (nem segredo, nem chamada externa).
      const corpo = e.requestInfo().body || {}
      const contaG = String(corpo.conta_id || '9624533125').replace(/-/g, '')
      const lote = corpo.linhas
      if (!Array.isArray(lote) || lote.length === 0) {
        return e.json(400, {
          ok: false,
          erro: 'corpo inválido: envie { "conta_id": "9624533125", "linhas": [ { "campanha_id", "campanha_nome", "data" (yyyy-mm-dd), "impressoes", "cliques", "gasto", "resultados", "objetivo" } ] }',
        })
      }
      let rejeitadas = 0
      for (const l of lote) {
        if (!l || typeof l !== 'object') {
          rejeitadas++
          continue
        }
        if (!l.campanha_id || !l.data || !/^\d{4}-\d{2}-\d{2}$/.test(String(l.data))) {
          rejeitadas++
          continue
        }
        const impr =
          l.impressoes !== undefined && l.impressoes !== null && l.impressoes !== ''
            ? Number(l.impressoes)
            : null
        const cliq =
          l.cliques !== undefined && l.cliques !== null && l.cliques !== ''
            ? Number(l.cliques)
            : null
        const gast =
          l.gasto !== undefined && l.gasto !== null && l.gasto !== '' ? Number(l.gasto) : null
        const resu =
          l.resultados !== undefined && l.resultados !== null && l.resultados !== ''
            ? Number(l.resultados)
            : null
        if (
          (impr === null || isNaN(impr)) &&
          (cliq === null || isNaN(cliq)) &&
          (gast === null || isNaN(gast))
        ) {
          rejeitadas++
          continue
        }
        linhas.push({
          campanhaId: String(l.campanha_id),
          campanhaNome: String(l.campanha_nome || ''),
          objetivo: String(l.objetivo || 'nao_informado'),
          data: String(l.data),
          alcance: null,
          impressoes: impr !== null && !isNaN(impr) ? impr : null,
          cliques: cliq !== null && !isNaN(cliq) ? cliq : null,
          gasto: gast !== null && !isNaN(gast) ? gast : null,
          resultados: resu !== null && !isNaN(resu) ? resu : null,
          contaG: contaG,
        })
      }
      if (linhas.length === 0) {
        gravarEstado(
          e.app,
          fonte,
          'erro_api',
          'lote rejeitado: ' + rejeitadas + ' linha(s) inválida(s) em ' + new Date().toISOString(),
          false,
        )
        return e.json(400, {
          ok: false,
          erro: 'nenhuma linha válida no lote (' + rejeitadas + ' rejeitada(s))',
          ingested: 0,
        })
      }
    }

    // ---- upsert idempotente (índice único: origem, canal, campanha_id, data) ----
    // findRecordsByFilter com data tipo date exige formato PB; para evitar
    // divergência de formato, a busca do existente usa só os campos de texto e
    // compara a data em JS (a janela de dedupe é pequena — ≤ 30 registros).
    const col = e.app.findCollectionByNameOrId('metricas_diarias')
    let gravados = 0
    for (const r of linhas) {
      if (!r.data) continue
      const filtro = "origem='api' && canal='" + fonte + "' && campanha_id='" + r.campanhaId + "'"
      const candidatos = e.app.findRecordsByFilter(col, filtro, '', 50, 0)
      let rec = null
      for (const c of candidatos) {
        if (String(c.get('data')).slice(0, 10) === r.data) {
          rec = e.app.findRecordById(col, c.id)
          break
        }
      }
      if (!rec) {
        rec = new Record(col)
        rec.set('origem', 'api')
        rec.set('canal', fonte)
      }
      const ehOrganico = r.objetivo === 'organico'
      rec.set('natureza', ehOrganico ? 'organico' : 'pago')
      rec.set('conta_id', r.contaG || conta)
      rec.set('campanha_id', r.campanhaId)
      rec.set('campanha_nome', r.campanhaNome)
      rec.set('objetivo', r.objetivo || 'nao_informado')
      rec.set('data', r.data)
      if (r.alcance !== null && r.alcance !== undefined) rec.set('alcance', r.alcance)
      if (r.impressoes !== null && r.impressoes !== undefined) rec.set('impressoes', r.impressoes)
      if (r.cliques !== null && r.cliques !== undefined) rec.set('cliques', r.cliques)
      if (r.gasto !== null && r.gasto !== undefined) rec.set('gasto', r.gasto)
      if (r.resultados !== null && r.resultados !== undefined) rec.set('resultados', r.resultados)
      e.app.save(rec)
      gravados++
    }

    // RN-07: última ingestão só avança em sucesso
    gravarEstado(e.app, fonte, 'conectado', avisoOrganico, true)
    console.log('ingestão ' + fonte + ': ' + gravados + ' registros')
    return e.json(200, { ok: true, ingested: gravados, fonte: fonte, aviso: avisoOrganico || null })
  } catch (err) {
    gravarEstado(
      e.app,
      fonte,
      'erro_api',
      'exceção na ingestão em ' + new Date().toISOString(),
      false,
    )
    return e.json(500, {
      ok: false,
      erro: 'ingestão falhou; dados anteriores preservados',
      detalhe: String(err).slice(0, 200),
    })
  }
})
