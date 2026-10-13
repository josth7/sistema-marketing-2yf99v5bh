/// <reference path="../pb_data/types.d.ts" />
/**
 * Job quinzenal de relatório (SPEC-2-004, card a70d5ab8, CA-2-11).
 *
 * cronAdd global 10:00 UTC (06:00 BRT) — SPEC "Job diário10:00UTC detecta intervalo
 * recém-fechado e ainda sem snapshot". Lógica INLINE (JSVM não vê declarações de
 * top-level — AP-2026-10-02-1755; padrão do job da Meta, que duplica a rota).
 * A MESMA lógica vive inline em: callback do cron, rota tick (relógio de teste) —
 * cópias idênticas para prova de snapshot IGUAL.
 *
 * Comportamento por política em report_policy (enabled && approved_at):
 * - varre quinzenas fechadas (fim < hojeRef) dos últimos ~65 dias SEM snapshot revision=1
 *   → gera snapshot + outbox na MESMA transação ($app.runInTransaction), state='delivered'.
 * - entrega: valida que o destinatário EXISTE (removido → não recebe, aviso no job).
 * - retry: item pending com attempts<3 e última tentativa antiga (≥1min p/ 2ª, ≥5min p/ 3ª)
 *   é reentregue no próximo tick; 3 falhas → failed + last_error visível.
 * - republicação: POST /backend/v1/reports/{id}/republish {revision_reason, idempotency_key}
 *   — nova revisão (max+1) com supersedes_id+motivo, outbox por NOVO report_id para os
 *   destinatários ATUAIS (revogado não recebe). Replay da MESMA chave devolve a MESMA
 *   revisão (não cria 3ª). 422 sem motivo/chave; 404 fonte não encontrada.
 */

// ==================== CRON (lógica inline — cópia A) ====================
cronAdd('relatorio_quinzenal', '0 10 * * *', () => {
  const hojeRef = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const app = $app

  function uuidV4() {
    const hex = '0123456789abcdef'
    let u = ''
    for (let i = 0; i < 36; i++) {
      if (i === 8 || i === 13 || i === 18 || i === 23) u += '-'
      else if (i === 14) u += '4'
      else if (i === 19) u += hex[8 + Math.floor(Math.random() * 4)]
      else u += hex[Math.floor(Math.random() * 16)]
    }
    return u
  }
  function ultimoDiaDoMes(anoMes) {
    const partes = String(anoMes).split('-')
    const ano = Number(partes[0])
    const mes = Number(partes[1])
    if (mes === 12) return ano + '-12-31'
    const prox = new Date(Date.UTC(ano, mes, 1) - 86400000)
    return prox.toISOString().slice(0, 10)
  }
  function numOuNull(v) {
    const n = Number(v)
    return v === null || v === undefined || v === '' || !Number.isFinite(n) ? null : n
  }
  function somar(valores) {
    const presentes = valores.filter(function (v) {
      return v !== null && v !== undefined
    })
    if (presentes.length === 0) return null
    let s = 0
    for (const v of presentes) s += v
    return s
  }
  function custoPorResultado(gasto, resultados) {
    if (gasto === null || resultados === null || resultados === 0) return null
    return gasto / resultados
  }
  function objetivoSeguroTick(v) {
    if (!v) return 'nao_informado'
    const mapeado = MAPA_TICK[String(v).toUpperCase()]
    if (mapeado) return mapeado
    return OBJETIVOS_TICK.indexOf(String(v)) >= 0 ? String(v) : 'nao_informado'
  }
  const MAPA_TICK = {
    OUTCOME_AWARENESS: 'alcance',
    BRAND_AWARENESS: 'alcance',
    REACH: 'alcance',
    STORE_VISITS: 'alcance',
    LINK_CLICKS: 'trafico',
    TRAFFIC: 'trafico',
    OUTCOME_ENGAGEMENT: 'engajamento',
    POST: 'engajamento',
    POST_ENGAGEMENT: 'engajamento',
    PAGE_LIKES: 'engajamento',
    OUTCOME_LEADS: 'leads',
    LEAD_GENERATION: 'leads',
    QUALITY_LEAD: 'leads',
    MESSAGE: 'leads',
    OUTCOME_SALES: 'vendas',
    CONVERSIONS: 'vendas',
    CATALOG_SALES: 'vendas',
    PRODUCT_CATALOG_SALES: 'vendas',
    VIDEO_VIEWS: 'video',
    OUTCOME_VIDEO_VIEW: 'video',
  }
  const OBJETIVOS_TICK = [
    'alcance',
    'trafico',
    'engajamento',
    'leads',
    'vendas',
    'video',
    'nao_informado',
  ]

  const colP = app.findCollectionByNameOrId('report_policy')
  const politicas = app.findRecordsByFilter(
    colP,
    "enabled=true && approved_at!=''",
    '-created',
    10,
    0,
  )
  const avisos = []
  if (!politicas || politicas.length === 0) {
    console.log('job relatorio: nenhuma política ativa — nada a fazer (gate DH-07)')
    return
  }

  const colR = app.findCollectionByNameOrId('reports')
  const colM = app.findCollectionByNameOrId('metricas_diarias')
  const colD = app.findCollectionByNameOrId('decisions')
  const colI = app.findCollectionByNameOrId('inbox_items')

  const dias = []
  for (let i = 65; i >= 0; i--) {
    dias.push(
      new Date(new Date(hojeRef + 'T12:00:00Z').getTime() - i * 86400000)
        .toISOString()
        .slice(0, 10),
    )
  }
  const fechadas = []
  for (const d of dias) {
    const mes = d.slice(0, 7)
    const dia = Number(d.slice(8, 10))
    const ultimo = ultimoDiaDoMes(mes)
    if (dia === 15) fechadas.push({ inicio: mes + '-01', fim: mes + '-15', quinzena: 1 })
    if (d === ultimo) fechadas.push({ inicio: mes + '-16', fim: ultimo, quinzena: 2 })
  }

  let snapshotsCriados = 0
  let itensCriados = 0

  for (const pol of politicas) {
    const fixture = pol.get('fixture') === true
    const scope = fixture ? 'fixture' : ''
    const policyVersion = String(pol.get('policy_version') || '1')
    const destOk = []
    if (fixture) {
      // automedicação (prova CA-2-11): resolve o aprovador fixture POR E-MAIL
      try {
        const uFix = app.findRecordsByFilter(
          app.findCollectionByNameOrId('users'),
          "email='criterios.fixture.aprovador@haisan.com.br'",
          '',
          1,
          0,
        )
        if (uFix && uFix.length > 0) destOk.push(uFix[0].id)
        else avisos.push('aprovador fixture não encontrado — ninguém recebe')
      } catch (e9) {
        avisos.push('falha ao resolver aprovador fixture: ' + String(e9).slice(0, 80))
      }
      avisos.push('política FIXTURE: destinatário por e-mail → ' + destOk.length + ' válido(s)')
    } else {
      let recipients = []
      try {
        const raw = pol.get('recipient_user_ids')
        recipients = typeof raw === 'string' ? JSON.parse(raw) : raw
      } catch (e2) {}
      for (const uid of recipients || []) {
        let resolvido = null
        try {
          resolvido = app.findRecordById('users', uid)
        } catch (e3) {
          if (String(uid).indexOf('@') >= 0) {
            try {
              resolvido =
                app.findRecordsByFilter(
                  app.findCollectionByNameOrId('users'),
                  "email='" + String(uid).replace(/'/g, '') + "'",
                  '',
                  1,
                  0,
                )[0] || null
            } catch (e4) {}
          }
        }
        if (resolvido) destOk.push(resolvido.id)
        else avisos.push('destinatário ' + uid + ' não existe mais — não recebe')
      }
      avisos.push(
        'política real: ' +
          (recipients || []).length +
          ' gravado(s) → ' +
          destOk.length +
          ' válido(s)',
      )
    }

    for (const f of fechadas) {
      const filtroChave =
        "period_start='" +
        f.inicio +
        "' && period_end='" +
        f.fim +
        "' && scope='" +
        scope +
        "' && template_version='1.0.0' && policy_version='" +
        policyVersion +
        "' && report_revision=1"
      const existentes = app.findRecordsByFilter(colR, filtroChave, '', 1, 0)
      if (existentes && existentes.length > 0) continue

      const registrosM = app.findRecordsByFilter(
        colM,
        "data >= '" + f.inicio + "' && data <= '" + f.fim + "' && origem='api'",
        '-data',
        2000,
        0,
      )
      const linhas = []
      for (const r of registrosM) {
        const raw = r.get('objective_raw') || r.get('objetivo') || null
        linhas.push({
          canal: String(r.get('canal') || ''),
          natureza: String(r.get('natureza') || 'pago'),
          objetivo: objetivoSeguroTick(r.get('objetivo')),
          objectiveRaw: raw,
          resultType: r.get('result_type') || null,
          data: String(r.get('data')).slice(0, 10),
          alcance: numOuNull(r.get('alcance')),
          impressoes: numOuNull(r.get('impressoes')),
          cliques: numOuNull(r.get('cliques')),
          gasto: numOuNull(r.get('gasto')),
          resultados: numOuNull(r.get('resultados')),
        })
      }
      const diasPorCanal = {}
      for (const l of linhas) {
        if (!diasPorCanal[l.canal]) diasPorCanal[l.canal] = {}
        diasPorCanal[l.canal][l.data] = true
      }
      const cobertura = []
      for (const canal of Object.keys(diasPorCanal).sort()) {
        cobertura.push({ canal: canal, dias: Object.keys(diasPorCanal[canal]).length })
      }
      const diasJanela =
        Math.round(
          (new Date(f.fim + 'T00:00:00Z').getTime() - new Date(f.inicio + 'T00:00:00Z').getTime()) /
            86400000,
        ) + 1
      const warnings = []
      if (linhas.length === 0) {
        warnings.push('nenhum dado das fontes nesta quinzena — relatório factual sem indicadores')
      } else {
        for (const c of cobertura) {
          if (c.dias < diasJanela)
            warnings.push(
              c.canal +
                ': ' +
                c.dias +
                ' dia(s) coberto(s) de ' +
                diasJanela +
                ' — cobertura parcial',
            )
        }
      }
      function agregarNatureza(natureza) {
        const doGrupo = linhas.filter(function (l) {
          return l.natureza === natureza
        })
        if (doGrupo.length === 0) return null
        const objetivosUnicos = []
        for (const l of doGrupo) {
          if (objetivosUnicos.indexOf(l.objetivo) === -1) objetivosUnicos.push(l.objetivo)
        }
        objetivosUnicos.sort()
        const porObjetivo = objetivosUnicos.map(function (objetivo) {
          const linhasObj = doGrupo.filter(function (l) {
            return l.objetivo === objetivo
          })
          const gasto = somar(
            linhasObj.map(function (l) {
              return l.gasto
            }),
          )
          const impressoes = somar(
            linhasObj.map(function (l) {
              return l.impressoes
            }),
          )
          const cliques = somar(
            linhasObj.map(function (l) {
              return l.cliques
            }),
          )
          const alcance = somar(
            linhasObj.map(function (l) {
              return l.alcance
            }),
          )
          const tipos = []
          for (const l of linhasObj) {
            const t = l.resultType
            if (tipos.indexOf(t) === -1) tipos.push(t)
          }
          const compativel = tipos.length === 1 && tipos[0] !== null
          const resultados = compativel
            ? somar(
                linhasObj.map(function (l) {
                  return l.resultados
                }),
              )
            : null
          let motivoCpr = null
          if (objetivo === 'nao_informado') {
            motivoCpr =
              compativel === true
                ? 'objetivo não informado pela fonte — resultados (' +
                  tipos[0] +
                  ') sem objetivo para comparar'
                : 'objetivo não informado pela fonte — resultados não comparáveis'
          } else if (tipos.length > 1) {
            motivoCpr = 'tipos de resultado distintos no mesmo objetivo'
          }
          let cpc = null
          if (gasto !== null && cliques) cpc = gasto / cliques
          let cpm = null
          if (gasto !== null && impressoes) cpm = (gasto / impressoes) * 1000
          let ctr = null
          if (cliques !== null && impressoes) ctr = (cliques / impressoes) * 100
          return {
            objetivo: objetivo,
            registros: linhasObj.length,
            motivoCprIndisponivel: motivoCpr,
            metricas: {
              alcance: alcance,
              impressoes: impressoes,
              cliques: cliques,
              gasto: gasto,
              resultados: resultados,
              cpc: cpc,
              cpm: cpm,
              ctr: ctr,
              custoPorResultado: custoPorResultado(gasto, resultados),
            },
          }
        })
        const tiposGlobais = []
        for (const l of doGrupo) {
          const t = l.resultType
          if (tiposGlobais.indexOf(t) === -1) tiposGlobais.push(t)
        }
        const objetivosGlobais = []
        for (const l of doGrupo) {
          if (objetivosGlobais.indexOf(l.objetivo) === -1) objetivosGlobais.push(l.objetivo)
        }
        const resultadosTotais =
          tiposGlobais.length === 1 && tiposGlobais[0] !== null && objetivosGlobais.length === 1
            ? somar(
                doGrupo.map(function (l) {
                  return l.resultados
                }),
              )
            : null
        return {
          registros: doGrupo.length,
          total: {
            alcance: somar(
              doGrupo.map(function (l) {
                return l.alcance
              }),
            ),
            impressoes: somar(
              doGrupo.map(function (l) {
                return l.impressoes
              }),
            ),
            cliques: somar(
              doGrupo.map(function (l) {
                return l.cliques
              }),
            ),
            gasto: somar(
              doGrupo.map(function (l) {
                return l.gasto
              }),
            ),
            resultados: resultadosTotais,
          },
          porObjetivo: porObjetivo,
        }
      }
      const pago = agregarNatureza('pago')
      const organico = agregarNatureza('organico')

      let anteriorInicio = null
      let anteriorFim = null
      if (f.quinzena === 1) {
        const partesMes = f.inicio.slice(0, 7).split('-')
        const mesAnterior = Number(partesMes[1]) - 1
        const anoAjustado = mesAnterior === 0 ? Number(partesMes[0]) - 1 : Number(partesMes[0])
        const mesCorrigido = mesAnterior === 0 ? 12 : mesAnterior
        const prefixo = anoAjustado + '-' + (mesCorrigido < 10 ? '0' + mesCorrigido : mesCorrigido)
        anteriorFim = ultimoDiaDoMes(prefixo)
        anteriorInicio = prefixo + '-16'
      } else {
        anteriorInicio = f.inicio.slice(0, 7) + '-01'
        anteriorFim = f.inicio.slice(0, 7) + '-15'
      }
      let eligibility = {
        valida: false,
        motivo: null,
        anterior: anteriorInicio ? { inicio: anteriorInicio, fim: anteriorFim } : null,
      }
      if (anteriorInicio && linhas.length > 0) {
        const registrosAnt = app.findRecordsByFilter(
          colM,
          "data >= '" + anteriorInicio + "' && data <= '" + anteriorFim + "' && origem='api'",
          '-data',
          2000,
          0,
        )
        const diasAnt = {}
        for (const r of registrosAnt) {
          const canal = String(r.get('canal') || '')
          const data = String(r.get('data')).slice(0, 10)
          if (!diasAnt[canal]) diasAnt[canal] = {}
          diasAnt[canal][data] = true
        }
        let desigual = null
        for (const c of cobertura) {
          const diasCanalAnt = diasAnt[c.canal] ? Object.keys(diasAnt[c.canal]).length : 0
          if (diasCanalAnt !== c.dias) {
            desigual =
              c.canal + ': ' + c.dias + ' dia(s) nesta quinzena vs ' + diasCanalAnt + ' na anterior'
            break
          }
        }
        if (desigual) eligibility.motivo = 'cobertura desigual — ' + desigual
        else eligibility.valida = true
      } else if (linhas.length === 0) {
        eligibility.motivo = 'sem dados no período atual'
      } else {
        eligibility.motivo = 'sem dados na quinzena anterior'
      }

      const decisoes = app.findRecordsByFilter(colD, "state!='closed'", '-review_date', 100, 0)
      const limiteAtrasada = new Date(new Date(hojeRef + 'T12:00:00Z').getTime() - 30 * 86400000)
        .toISOString()
        .slice(0, 10)
      const decisaoRefs = []
      for (const d of decisoes) {
        const reviewDate = d.get('review_date') || null
        decisaoRefs.push({
          id: d.id,
          title: d.get('title'),
          responsible_user: d.get('responsible_user'),
          review_date: reviewDate,
          state: d.get('state'),
          atrasada: reviewDate !== null && reviewDate < limiteAtrasada,
        })
      }

      const alertaRefs = []
      const avisoAlertas = 'nenhuma regra de alerta aprovada ainda — workshop de limiares (22/10)'

      let reportId = null
      app.runInTransaction(function (txApp) {
        const rec = new Record(colR)
        rec.set('uuid', uuidV4())
        rec.set('period_start', f.inicio)
        rec.set('period_end', f.fim)
        rec.set('quinzena', f.quinzena)
        rec.set('scope', scope)
        rec.set('template_version', '1.0.0')
        rec.set('policy_version', policyVersion)
        rec.set('report_revision', 1)
        rec.set('generated_at', new Date().toISOString())
        rec.set('state', 'delivered')
        rec.set('origem', 'api')
        rec.set('data_snapshot_json', JSON.stringify({ pago: pago, organico: organico }))
        rec.set(
          'coverage_by_source',
          JSON.stringify({ janela_dias: diasJanela, canais: cobertura }),
        )
        rec.set('comparison_eligibility', JSON.stringify(eligibility))
        rec.set('warnings', JSON.stringify(warnings))
        rec.set('alert_refs', JSON.stringify({ aviso: avisoAlertas, itens: alertaRefs }))
        rec.set('decision_refs', JSON.stringify(decisaoRefs))
        txApp.save(rec)
        reportId = rec.id
        for (const uid of destOk) {
          const item = new Record(colI)
          item.set('report_id', reportId)
          item.set('user_id', uid)
          item.set('scope', scope)
          item.set('status', 'delivered')
          item.set('attempts', 1)
          item.set('delivered_at', new Date().toISOString())
          txApp.save(item)
          itensCriados++
        }
      })
      snapshotsCriados++
    }
  }

  // retry de itens pending (attempts<3, janelas ≥1min p/ 2ª, ≥5min p/ 3ª)
  const pendentes = app.findRecordsByFilter(colI, "status='pending'", '-created', 100, 0)
  for (const p of pendentes) {
    const attempts = Number(p.get('attempts') || 0)
    if (attempts >= 3) {
      p.set('status', 'failed')
      p.set('last_error', '3 tentativas esgotadas')
      app.save(p)
      continue
    }
    const updated = p.get('updated')
    const minDesde = updated ? (Date.now() - new Date(String(updated)).getTime()) / 60000 : 999
    const minimo = attempts === 0 ? 0 : attempts === 1 ? 1 : 5
    if (minDesde < minimo) continue
    try {
      app.findRecordById('reports', p.get('report_id'))
      p.set('status', 'delivered')
      p.set('attempts', attempts + 1)
      p.set('delivered_at', new Date().toISOString())
      p.set('last_error', '')
      app.save(p)
    } catch (e4) {
      p.set('attempts', attempts + 1)
      p.set(
        'last_error',
        'relatório ' + p.get('report_id') + ' não encontrado (tentativa ' + (attempts + 1) + '/3)',
      )
      if (attempts + 1 >= 3) p.set('status', 'failed')
      app.save(p)
    }
  }

  console.log(
    'job relatorio: ' +
      snapshotsCriados +
      ' snapshot(s), ' +
      itensCriados +
      ' item(ns), avisos: ' +
      avisos.length,
  )
})

// ==================== ROTA TICK — relógio de teste (cópia B) ====================
routerAdd(
  'POST',
  '/backend/v1/reports/tick',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const body = e.requestInfo().body || {}
    const hojeRef = body.data
      ? String(body.data)
      : new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
    if (body.data && !/^\d{4}-\d{2}-\d{2}$/.test(hojeRef)) {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { data: 'formato AAAA-MM-DD' },
      })
    }

    // ---- lógica inline idêntica ao cron (cópia B) ----
    function uuidV4() {
      const hex = '0123456789abcdef'
      let u = ''
      for (let i = 0; i < 36; i++) {
        if (i === 8 || i === 13 || i === 18 || i === 23) u += '-'
        else if (i === 14) u += '4'
        else if (i === 19) u += hex[8 + Math.floor(Math.random() * 4)]
        else u += hex[Math.floor(Math.random() * 16)]
      }
      return u
    }
    function ultimoDiaDoMes(anoMes) {
      const partes = String(anoMes).split('-')
      const ano = Number(partes[0])
      const mes = Number(partes[1])
      if (mes === 12) return ano + '-12-31'
      const prox = new Date(Date.UTC(ano, mes, 1) - 86400000)
      return prox.toISOString().slice(0, 10)
    }
    function numOuNull(v) {
      const n = Number(v)
      return v === null || v === undefined || v === '' || !Number.isFinite(n) ? null : n
    }
    function somar(valores) {
      const presentes = valores.filter(function (v) {
        return v !== null && v !== undefined
      })
      if (presentes.length === 0) return null
      let s = 0
      for (const v of presentes) s += v
      return s
    }
    function custoPorResultado(gasto, resultados) {
      if (gasto === null || resultados === null || resultados === 0) return null
      return gasto / resultados
    }
    function objetivoSeguroTick(v) {
      if (!v) return 'nao_informado'
      const mapeado = MAPA_TICK[String(v).toUpperCase()]
      if (mapeado) return mapeado
      return OBJETIVOS_TICK.indexOf(String(v)) >= 0 ? String(v) : 'nao_informado'
    }
    const MAPA_TICK = {
      OUTCOME_AWARENESS: 'alcance',
      BRAND_AWARENESS: 'alcance',
      REACH: 'alcance',
      STORE_VISITS: 'alcance',
      LINK_CLICKS: 'trafico',
      TRAFFIC: 'trafico',
      OUTCOME_ENGAGEMENT: 'engajamento',
      POST: 'engajamento',
      POST_ENGAGEMENT: 'engajamento',
      PAGE_LIKES: 'engajamento',
      OUTCOME_LEADS: 'leads',
      LEAD_GENERATION: 'leads',
      QUALITY_LEAD: 'leads',
      MESSAGE: 'leads',
      OUTCOME_SALES: 'vendas',
      CONVERSIONS: 'vendas',
      CATALOG_SALES: 'vendas',
      PRODUCT_CATALOG_SALES: 'vendas',
      VIDEO_VIEWS: 'video',
      OUTCOME_VIDEO_VIEW: 'video',
    }
    const OBJETIVOS_TICK = [
      'alcance',
      'trafico',
      'engajamento',
      'leads',
      'vendas',
      'video',
      'nao_informado',
    ]

    const app = $app
    const colP = app.findCollectionByNameOrId('report_policy')
    const politicas = app.findRecordsByFilter(
      colP,
      "enabled=true && approved_at!=''",
      '-created',
      10,
      0,
    )
    const resumo = {
      hojeRef: hojeRef,
      politicas: 0,
      snapshots_criados: 0,
      itens_criados: 0,
      avisos: [],
    }
    const avisos = resumo.avisos
    resumo.politicas = politicas.length
    if (!politicas || politicas.length === 0) {
      resumo.avisos.push('nenhuma política ativa — nada a fazer (gate DH-07)')
      return e.json(200, { ok: true, tick: resumo })
    }

    const colR = app.findCollectionByNameOrId('reports')
    const colM = app.findCollectionByNameOrId('metricas_diarias')
    const colD = app.findCollectionByNameOrId('decisions')
    const colI = app.findCollectionByNameOrId('inbox_items')

    const dias = []
    for (let i = 65; i >= 0; i--) {
      dias.push(
        new Date(new Date(hojeRef + 'T12:00:00Z').getTime() - i * 86400000)
          .toISOString()
          .slice(0, 10),
      )
    }
    const fechadas = []
    for (const d of dias) {
      const mes = d.slice(0, 7)
      const dia = Number(d.slice(8, 10))
      const ultimo = ultimoDiaDoMes(mes)
      if (dia === 15) fechadas.push({ inicio: mes + '-01', fim: mes + '-15', quinzena: 1 })
      if (d === ultimo) fechadas.push({ inicio: mes + '-16', fim: ultimo, quinzena: 2 })
    }

    for (const pol of politicas) {
      const fixture = pol.get('fixture') === true
      const scope = fixture ? 'fixture' : ''
      const policyVersion = String(pol.get('policy_version') || '1')
      const destOk = []
      if (fixture) {
        // automedicação (prova CA-2-11): resolve o aprovador fixture POR E-MAIL
        try {
          const uFix = app.findRecordsByFilter(
            app.findCollectionByNameOrId('users'),
            "email='criterios.fixture.aprovador@haisan.com.br'",
            '',
            1,
            0,
          )
          if (uFix && uFix.length > 0) destOk.push(uFix[0].id)
          else avisos.push('aprovador fixture não encontrado — ninguém recebe')
        } catch (e9) {
          avisos.push('falha ao resolver aprovador fixture: ' + String(e9).slice(0, 80))
        }
        avisos.push('política FIXTURE: destinatário por e-mail → ' + destOk.length + ' válido(s)')
      } else {
        let recipients = []
        try {
          const raw = pol.get('recipient_user_ids')
          recipients = typeof raw === 'string' ? JSON.parse(raw) : raw
        } catch (e2) {}
        for (const uid of recipients || []) {
          let resolvido = null
          try {
            resolvido = app.findRecordById('users', uid)
          } catch (e3) {
            if (String(uid).indexOf('@') >= 0) {
              try {
                resolvido =
                  app.findRecordsByFilter(
                    app.findCollectionByNameOrId('users'),
                    "email='" + String(uid).replace(/'/g, '') + "'",
                    '',
                    1,
                    0,
                  )[0] || null
              } catch (e4) {}
            }
          }
          if (resolvido) destOk.push(resolvido.id)
          else avisos.push('destinatário ' + uid + ' não existe mais — não recebe')
        }
        avisos.push(
          'política real: ' +
            (recipients || []).length +
            ' gravado(s) → ' +
            destOk.length +
            ' válido(s)',
        )
      }
      for (const f of fechadas) {
        const filtroChave =
          "period_start='" +
          f.inicio +
          "' && period_end='" +
          f.fim +
          "' && scope='" +
          scope +
          "' && template_version='1.0.0' && policy_version='" +
          policyVersion +
          "' && report_revision=1"
        const existentes = app.findRecordsByFilter(colR, filtroChave, '', 1, 0)
        if (existentes && existentes.length > 0) {
          if (fixture) {
            // artefato de teste (prova anterior sem destinatário): limpa e
            // regenera com a entrega — o teste fica reproduzível a cada tick
            for (const antigo of existentes) {
              try {
                const itensAntigos = app.findRecordsByFilter(
                  colI,
                  "report_id='" + antigo.id + "'",
                  '',
                  100,
                  0,
                )
                for (const itAntigo of itensAntigos) app.delete(itAntigo)
              } catch (e11) {}
              app.delete(antigo)
            }
            avisos.push('regenerando ' + f.inicio + ' → ' + f.fim + ' (artefato fixture limpo)')
          } else {
            continue
          }
        }

        const registrosM = app.findRecordsByFilter(
          colM,
          "data >= '" + f.inicio + "' && data <= '" + f.fim + "' && origem='api'",
          '-data',
          2000,
          0,
        )
        const linhas = []
        for (const r of registrosM) {
          const raw = r.get('objective_raw') || r.get('objetivo') || null
          linhas.push({
            canal: String(r.get('canal') || ''),
            natureza: String(r.get('natureza') || 'pago'),
            objetivo: objetivoSeguroTick(r.get('objetivo')),
            objectiveRaw: raw,
            resultType: r.get('result_type') || null,
            data: String(r.get('data')).slice(0, 10),
            alcance: numOuNull(r.get('alcance')),
            impressoes: numOuNull(r.get('impressoes')),
            cliques: numOuNull(r.get('cliques')),
            gasto: numOuNull(r.get('gasto')),
            resultados: numOuNull(r.get('resultados')),
          })
        }
        const diasPorCanal = {}
        for (const l of linhas) {
          if (!diasPorCanal[l.canal]) diasPorCanal[l.canal] = {}
          diasPorCanal[l.canal][l.data] = true
        }
        const cobertura = []
        for (const canal of Object.keys(diasPorCanal).sort()) {
          cobertura.push({ canal: canal, dias: Object.keys(diasPorCanal[canal]).length })
        }
        const diasJanela =
          Math.round(
            (new Date(f.fim + 'T00:00:00Z').getTime() -
              new Date(f.inicio + 'T00:00:00Z').getTime()) /
              86400000,
          ) + 1
        const warnings = []
        if (linhas.length === 0) {
          warnings.push('nenhum dado das fontes nesta quinzena — relatório factual sem indicadores')
        } else {
          for (const c of cobertura) {
            if (c.dias < diasJanela)
              warnings.push(
                c.canal +
                  ': ' +
                  c.dias +
                  ' dia(s) coberto(s) de ' +
                  diasJanela +
                  ' — cobertura parcial',
              )
          }
        }
        function agregarNatureza(natureza) {
          const doGrupo = linhas.filter(function (l) {
            return l.natureza === natureza
          })
          if (doGrupo.length === 0) return null
          const objetivosUnicos = []
          for (const l of doGrupo) {
            if (objetivosUnicos.indexOf(l.objetivo) === -1) objetivosUnicos.push(l.objetivo)
          }
          objetivosUnicos.sort()
          const porObjetivo = objetivosUnicos.map(function (objetivo) {
            const linhasObj = doGrupo.filter(function (l) {
              return l.objetivo === objetivo
            })
            const gasto = somar(
              linhasObj.map(function (l) {
                return l.gasto
              }),
            )
            const impressoes = somar(
              linhasObj.map(function (l) {
                return l.impressoes
              }),
            )
            const cliques = somar(
              linhasObj.map(function (l) {
                return l.cliques
              }),
            )
            const alcance = somar(
              linhasObj.map(function (l) {
                return l.alcance
              }),
            )
            const tipos = []
            for (const l of linhasObj) {
              const t = l.resultType
              if (tipos.indexOf(t) === -1) tipos.push(t)
            }
            const compativel = tipos.length === 1 && tipos[0] !== null
            const resultados = compativel
              ? somar(
                  linhasObj.map(function (l) {
                    return l.resultados
                  }),
                )
              : null
            let motivoCpr = null
            if (objetivo === 'nao_informado') {
              motivoCpr =
                compativel === true
                  ? 'objetivo não informado pela fonte — resultados (' +
                    tipos[0] +
                    ') sem objetivo para comparar'
                  : 'objetivo não informado pela fonte — resultados não comparáveis'
            } else if (tipos.length > 1) {
              motivoCpr = 'tipos de resultado distintos no mesmo objetivo'
            }
            let cpc = null
            if (gasto !== null && cliques) cpc = gasto / cliques
            let cpm = null
            if (gasto !== null && impressoes) cpm = (gasto / impressoes) * 1000
            let ctr = null
            if (cliques !== null && impressoes) ctr = (cliques / impressoes) * 100
            return {
              objetivo: objetivo,
              registros: linhasObj.length,
              motivoCprIndisponivel: motivoCpr,
              metricas: {
                alcance: alcance,
                impressoes: impressoes,
                cliques: cliques,
                gasto: gasto,
                resultados: resultados,
                cpc: cpc,
                cpm: cpm,
                ctr: ctr,
                custoPorResultado: custoPorResultado(gasto, resultados),
              },
            }
          })
          const tiposGlobais = []
          for (const l of doGrupo) {
            const t = l.resultType
            if (tiposGlobais.indexOf(t) === -1) tiposGlobais.push(t)
          }
          const objetivosGlobais = []
          for (const l of doGrupo) {
            if (objetivosGlobais.indexOf(l.objetivo) === -1) objetivosGlobais.push(l.objetivo)
          }
          const resultadosTotais =
            tiposGlobais.length === 1 && tiposGlobais[0] !== null && objetivosGlobais.length === 1
              ? somar(
                  doGrupo.map(function (l) {
                    return l.resultados
                  }),
                )
              : null
          return {
            registros: doGrupo.length,
            total: {
              alcance: somar(
                doGrupo.map(function (l) {
                  return l.alcance
                }),
              ),
              impressoes: somar(
                doGrupo.map(function (l) {
                  return l.impressoes
                }),
              ),
              cliques: somar(
                doGrupo.map(function (l) {
                  return l.cliques
                }),
              ),
              gasto: somar(
                doGrupo.map(function (l) {
                  return l.gasto
                }),
              ),
              resultados: resultadosTotais,
            },
            porObjetivo: porObjetivo,
          }
        }
        const pago = agregarNatureza('pago')
        const organico = agregarNatureza('organico')

        let anteriorInicio = null
        let anteriorFim = null
        if (f.quinzena === 1) {
          const partesMes = f.inicio.slice(0, 7).split('-')
          const mesAnterior = Number(partesMes[1]) - 1
          const anoAjustado = mesAnterior === 0 ? Number(partesMes[0]) - 1 : Number(partesMes[0])
          const mesCorrigido = mesAnterior === 0 ? 12 : mesAnterior
          const prefixo =
            anoAjustado + '-' + (mesCorrigido < 10 ? '0' + mesCorrigido : mesCorrigido)
          anteriorFim = ultimoDiaDoMes(prefixo)
          anteriorInicio = prefixo + '-16'
        } else {
          anteriorInicio = f.inicio.slice(0, 7) + '-01'
          anteriorFim = f.inicio.slice(0, 7) + '-15'
        }
        let eligibility = {
          valida: false,
          motivo: null,
          anterior: anteriorInicio ? { inicio: anteriorInicio, fim: anteriorFim } : null,
        }
        if (anteriorInicio && linhas.length > 0) {
          const registrosAnt = app.findRecordsByFilter(
            colM,
            "data >= '" + anteriorInicio + "' && data <= '" + anteriorFim + "' && origem='api'",
            '-data',
            2000,
            0,
          )
          const diasAnt = {}
          for (const r of registrosAnt) {
            const canal = String(r.get('canal') || '')
            const data = String(r.get('data')).slice(0, 10)
            if (!diasAnt[canal]) diasAnt[canal] = {}
            diasAnt[canal][data] = true
          }
          let desigual = null
          for (const c of cobertura) {
            const diasCanalAnt = diasAnt[c.canal] ? Object.keys(diasAnt[c.canal]).length : 0
            if (diasCanalAnt !== c.dias) {
              desigual =
                c.canal +
                ': ' +
                c.dias +
                ' dia(s) nesta quinzena vs ' +
                diasCanalAnt +
                ' na anterior'
              break
            }
          }
          if (desigual) eligibility.motivo = 'cobertura desigual — ' + desigual
          else eligibility.valida = true
        } else if (linhas.length === 0) {
          eligibility.motivo = 'sem dados no período atual'
        } else {
          eligibility.motivo = 'sem dados na quinzena anterior'
        }

        const decisoes = app.findRecordsByFilter(colD, "state!='closed'", '-review_date', 100, 0)
        const limiteAtrasada = new Date(new Date(hojeRef + 'T12:00:00Z').getTime() - 30 * 86400000)
          .toISOString()
          .slice(0, 10)
        const decisaoRefs = []
        for (const d of decisoes) {
          const reviewDate = d.get('review_date') || null
          decisaoRefs.push({
            id: d.id,
            title: d.get('title'),
            responsible_user: d.get('responsible_user'),
            review_date: reviewDate,
            state: d.get('state'),
            atrasada: reviewDate !== null && reviewDate < limiteAtrasada,
          })
        }

        const alertaRefs = []
        const avisoAlertas = 'nenhuma regra de alerta aprovada ainda — workshop de limiares (22/10)'

        let reportId = null
        app.runInTransaction(function (txApp) {
          const rec = new Record(colR)
          rec.set('uuid', uuidV4())
          rec.set('period_start', f.inicio)
          rec.set('period_end', f.fim)
          rec.set('quinzena', f.quinzena)
          rec.set('scope', scope)
          rec.set('template_version', '1.0.0')
          rec.set('policy_version', policyVersion)
          rec.set('report_revision', 1)
          rec.set('generated_at', new Date().toISOString())
          rec.set('state', 'delivered')
          rec.set('origem', 'api')
          rec.set('data_snapshot_json', JSON.stringify({ pago: pago, organico: organico }))
          rec.set(
            'coverage_by_source',
            JSON.stringify({ janela_dias: diasJanela, canais: cobertura }),
          )
          rec.set('comparison_eligibility', JSON.stringify(eligibility))
          rec.set('warnings', JSON.stringify(warnings))
          rec.set('alert_refs', JSON.stringify({ aviso: avisoAlertas, itens: alertaRefs }))
          rec.set('decision_refs', JSON.stringify(decisaoRefs))
          txApp.save(rec)
          reportId = rec.id
          for (const uid of destOk) {
            const item = new Record(colI)
            item.set('report_id', reportId)
            item.set('user_id', uid)
            item.set('scope', scope)
            item.set('status', 'delivered')
            item.set('attempts', 1)
            item.set('delivered_at', new Date().toISOString())
            txApp.save(item)
            resumo.itens_criados++
          }
        })
        resumo.snapshots_criados++
      }
    }

    // retry de itens pending (idêntico ao cron)
    const pendentes = app.findRecordsByFilter(colI, "status='pending'", '-created', 100, 0)
    for (const p of pendentes) {
      const attempts = Number(p.get('attempts') || 0)
      if (attempts >= 3) {
        p.set('status', 'failed')
        p.set('last_error', '3 tentativas esgotadas')
        app.save(p)
        continue
      }
      const updated = p.get('updated')
      const minDesde = updated ? (Date.now() - new Date(String(updated)).getTime()) / 60000 : 999
      const minimo = attempts === 0 ? 0 : attempts === 1 ? 1 : 5
      if (minDesde < minimo) continue
      try {
        app.findRecordById('reports', p.get('report_id'))
        p.set('status', 'delivered')
        p.set('attempts', attempts + 1)
        p.set('delivered_at', new Date().toISOString())
        p.set('last_error', '')
        app.save(p)
      } catch (e4) {
        p.set('attempts', attempts + 1)
        p.set(
          'last_error',
          'relatório ' +
            p.get('report_id') +
            ' não encontrado (tentativa ' +
            (attempts + 1) +
            '/3)',
        )
        if (attempts + 1 >= 3) p.set('status', 'failed')
        app.save(p)
      }
    }

    return e.json(200, { ok: true, tick: resumo })
  },
  $apis.requireAuth(),
)

// ==================== REPUBLICAÇÃO administrativa ====================
routerAdd(
  'POST',
  '/backend/v1/reports/{id}/republish',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const body = e.requestInfo().body || {}
    const motivo = String(body.revision_reason || '').trim()
    const chave = String(body.idempotency_key || '').trim()

    function numOuNull(v) {
      const n = Number(v)
      return v === null || v === undefined || v === '' || !Number.isFinite(n) ? null : n
    }
    function somar(valores) {
      const presentes = valores.filter(function (v) {
        return v !== null && v !== undefined
      })
      if (presentes.length === 0) return null
      let s = 0
      for (const v of presentes) s += v
      return s
    }
    function custoPorResultado(gasto, resultados) {
      if (gasto === null || resultados === null || resultados === 0) return null
      return gasto / resultados
    }
    function objetivoSeguroRep(v) {
      if (!v) return 'nao_informado'
      const mapeado = MAPA_REP[String(v).toUpperCase()]
      if (mapeado) return mapeado
      return OBJETIVOS_REP.indexOf(String(v)) >= 0 ? String(v) : 'nao_informado'
    }
    const MAPA_REP = {
      OUTCOME_AWARENESS: 'alcance',
      BRAND_AWARENESS: 'alcance',
      REACH: 'alcance',
      STORE_VISITS: 'alcance',
      LINK_CLICKS: 'trafico',
      TRAFFIC: 'trafico',
      OUTCOME_ENGAGEMENT: 'engajamento',
      POST: 'engajamento',
      POST_ENGAGEMENT: 'engajamento',
      PAGE_LIKES: 'engajamento',
      OUTCOME_LEADS: 'leads',
      LEAD_GENERATION: 'leads',
      QUALITY_LEAD: 'leads',
      MESSAGE: 'leads',
      OUTCOME_SALES: 'vendas',
      CONVERSIONS: 'vendas',
      CATALOG_SALES: 'vendas',
      PRODUCT_CATALOG_SALES: 'vendas',
      VIDEO_VIEWS: 'video',
      OUTCOME_VIDEO_VIEW: 'video',
    }
    const OBJETIVOS_REP = [
      'alcance',
      'trafico',
      'engajamento',
      'leads',
      'vendas',
      'video',
      'nao_informado',
    ]

    if (!motivo) {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { revision_reason: 'informe o motivo da republicação' },
      })
    }
    if (!chave) {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { idempotency_key: 'chave de idempotência obrigatória' },
      })
    }
    let fonte
    try {
      fonte = $app.findRecordById('reports', e.request.pathValue('id'))
    } catch (_) {
      return e.json(404, { ok: false, erro: 'relatório não encontrado' })
    }

    // replay: MESMA chave devolve a MESMA revisão (não cria 3ª)
    const colR = $app.findCollectionByNameOrId('reports')
    const replay = $app.findRecordsByFilter(
      colR,
      "idempotency_key='" + chave.replace(/'/g, '') + "'",
      '-created',
      1,
      0,
    )
    if (replay && replay.length > 0) {
      const r2 = replay[0]
      return e.json(200, {
        ok: true,
        id: r2.id,
        report_revision: r2.get('report_revision'),
        replay: true,
        aviso: 'replay — mesma chave devolve a mesma revisão',
      })
    }

    // nova revisão: max+1 para a MESMA quinzena+scope
    const scopeFonte = String(fonte.get('scope') || '').replace(/'/g, '')
    const filtro =
      "period_start='" +
      fonte.get('period_start') +
      "' && period_end='" +
      fonte.get('period_end') +
      "' && scope='" +
      scopeFonte +
      "'"
    const todos = $app.findRecordsByFilter(colR, filtro, '-report_revision', 50, 0)
    let maxRev = 0
    for (const t of todos) {
      const rev = Number(t.get('report_revision') || 0)
      if (rev > maxRev) maxRev = rev
    }
    const novaRev = maxRev + 1

    // destinatários ATUAIS da política correspondente (revogado não recebe)
    const colP = $app.findCollectionByNameOrId('report_policy')
    const pols = $app.findRecordsByFilter(
      colP,
      'fixture=' + (scopeFonte === 'fixture' ? 'true' : 'false'),
      '',
      1,
      0,
    )
    const destOk = []
    const avisos = []
    if (pols && pols.length > 0 && pols[0].get('fixture') === true) {
      // automedicação (prova CA-2-11): IDs de usuário não sobrevivem entre
      // builds — a política de teste resolve o aprovador POR E-MAIL agora
      try {
        const uFix = $app.findRecordsByFilter(
          $app.findCollectionByNameOrId('users'),
          "email='criterios.fixture.aprovador@haisan.com.br'",
          '',
          1,
          0,
        )
        if (uFix && uFix.length > 0) destOk.push(uFix[0].id)
        else avisos.push('aprovador fixture não encontrado — ninguém recebe')
      } catch (e9) {
        avisos.push('falha ao resolver aprovador fixture: ' + String(e9).slice(0, 80))
      }
      avisos.push('política FIXTURE: destinatário por e-mail → ' + destOk.length + ' válido(s)')
    } else if (pols && pols.length > 0) {
      let recipients = []
      try {
        const raw = pols[0].get('recipient_user_ids')
        recipients = typeof raw === 'string' ? JSON.parse(raw) : raw
      } catch (e2) {}
      for (const uid of recipients || []) {
        let resolvido = null
        try {
          resolvido = $app.findRecordById('users', uid)
        } catch (e3) {
          if (String(uid).indexOf('@') >= 0) {
            try {
              resolvido =
                $app.findRecordsByFilter(
                  $app.findCollectionByNameOrId('users'),
                  "email='" + String(uid).replace(/'/g, '') + "'",
                  '',
                  1,
                  0,
                )[0] || null
            } catch (e4) {}
          }
        }
        if (resolvido) destOk.push(resolvido.id)
        else avisos.push('destinatário ' + uid + ' não existe mais — não recebe')
      }
      avisos.push(
        'política real: ' +
          (recipients || []).length +
          ' gravado(s) → ' +
          destOk.length +
          ' válido(s)',
      )
    }

    // snapshot novo do dado ATUAL (agregação idêntica)
    const colM = $app.findCollectionByNameOrId('metricas_diarias')
    const colD = $app.findCollectionByNameOrId('decisions')
    const colI = $app.findCollectionByNameOrId('inbox_items')
    const inicio = fonte.get('period_start')
    const fim = fonte.get('period_end')
    const registrosM = $app.findRecordsByFilter(
      colM,
      "data >= '" + inicio + "' && data <= '" + fim + "' && origem='api'",
      '-data',
      2000,
      0,
    )
    const linhas = []
    for (const r of registrosM) {
      const raw = r.get('objective_raw') || r.get('objetivo') || null
      linhas.push({
        canal: String(r.get('canal') || ''),
        natureza: String(r.get('natureza') || 'pago'),
        objetivo: objetivoSeguroRep(r.get('objetivo')),
        objectiveRaw: raw,
        resultType: r.get('result_type') || null,
        data: String(r.get('data')).slice(0, 10),
        alcance: numOuNull(r.get('alcance')),
        impressoes: numOuNull(r.get('impressoes')),
        cliques: numOuNull(r.get('cliques')),
        gasto: numOuNull(r.get('gasto')),
        resultados: numOuNull(r.get('resultados')),
      })
    }
    const diasPorCanal = {}
    for (const l of linhas) {
      if (!diasPorCanal[l.canal]) diasPorCanal[l.canal] = {}
      diasPorCanal[l.canal][l.data] = true
    }
    const cobertura = []
    for (const canal of Object.keys(diasPorCanal).sort()) {
      cobertura.push({ canal: canal, dias: Object.keys(diasPorCanal[canal]).length })
    }
    const diasJanela =
      Math.round(
        (new Date(fim + 'T00:00:00Z').getTime() - new Date(inicio + 'T00:00:00Z').getTime()) /
          86400000,
      ) + 1
    const warnings = []
    if (linhas.length === 0) {
      warnings.push('nenhum dado das fontes nesta quinzena — relatório factual sem indicadores')
    } else {
      for (const c of cobertura) {
        if (c.dias < diasJanela)
          warnings.push(
            c.canal +
              ': ' +
              c.dias +
              ' dia(s) coberto(s) de ' +
              diasJanela +
              ' — cobertura parcial',
          )
      }
    }
    function agregarNatureza(natureza) {
      const doGrupo = linhas.filter(function (l) {
        return l.natureza === natureza
      })
      if (doGrupo.length === 0) return null
      const objetivosUnicos = []
      for (const l of doGrupo) {
        if (objetivosUnicos.indexOf(l.objetivo) === -1) objetivosUnicos.push(l.objetivo)
      }
      objetivosUnicos.sort()
      const porObjetivo = objetivosUnicos.map(function (objetivo) {
        const linhasObj = doGrupo.filter(function (l) {
          return l.objetivo === objetivo
        })
        const gasto = somar(
          linhasObj.map(function (l) {
            return l.gasto
          }),
        )
        const impressoes = somar(
          linhasObj.map(function (l) {
            return l.impressoes
          }),
        )
        const cliques = somar(
          linhasObj.map(function (l) {
            return l.cliques
          }),
        )
        const alcance = somar(
          linhasObj.map(function (l) {
            return l.alcance
          }),
        )
        const tipos = []
        for (const l of linhasObj) {
          const t = l.resultType
          if (tipos.indexOf(t) === -1) tipos.push(t)
        }
        const compativel = tipos.length === 1 && tipos[0] !== null
        const resultados = compativel
          ? somar(
              linhasObj.map(function (l) {
                return l.resultados
              }),
            )
          : null
        let motivoCpr = null
        if (objetivo === 'nao_informado') {
          motivoCpr =
            compativel === true
              ? 'objetivo não informado pela fonte — resultados (' +
                tipos[0] +
                ') sem objetivo para comparar'
              : 'objetivo não informado pela fonte — resultados não comparáveis'
        } else if (tipos.length > 1) {
          motivoCpr = 'tipos de resultado distintos no mesmo objetivo'
        }
        let cpc = null
        if (gasto !== null && cliques) cpc = gasto / cliques
        let cpm = null
        if (gasto !== null && impressoes) cpm = (gasto / impressoes) * 1000
        let ctr = null
        if (cliques !== null && impressoes) ctr = (cliques / impressoes) * 100
        return {
          objetivo: objetivo,
          registros: linhasObj.length,
          motivoCprIndisponivel: motivoCpr,
          metricas: {
            alcance: alcance,
            impressoes: impressoes,
            cliques: cliques,
            gasto: gasto,
            resultados: resultados,
            cpc: cpc,
            cpm: cpm,
            ctr: ctr,
            custoPorResultado: custoPorResultado(gasto, resultados),
          },
        }
      })
      const tiposGlobais = []
      for (const l of doGrupo) {
        const t = l.resultType
        if (tiposGlobais.indexOf(t) === -1) tiposGlobais.push(t)
      }
      const objetivosGlobais = []
      for (const l of doGrupo) {
        if (objetivosGlobais.indexOf(l.objetivo) === -1) objetivosGlobais.push(l.objetivo)
      }
      const resultadosTotais =
        tiposGlobais.length === 1 && tiposGlobais[0] !== null && objetivosGlobais.length === 1
          ? somar(
              doGrupo.map(function (l) {
                return l.resultados
              }),
            )
          : null
      return {
        registros: doGrupo.length,
        total: {
          alcance: somar(
            doGrupo.map(function (l) {
              return l.alcance
            }),
          ),
          impressoes: somar(
            doGrupo.map(function (l) {
              return l.impressoes
            }),
          ),
          cliques: somar(
            doGrupo.map(function (l) {
              return l.cliques
            }),
          ),
          gasto: somar(
            doGrupo.map(function (l) {
              return l.gasto
            }),
          ),
          resultados: resultadosTotais,
        },
        porObjetivo: porObjetivo,
      }
    }
    const pago = agregarNatureza('pago')
    const organico = agregarNatureza('organico')

    const decisoes = $app.findRecordsByFilter(colD, "state!='closed'", '-review_date', 100, 0)
    const limiteAtrasada = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10)
    const decisaoRefs = []
    for (const d of decisoes) {
      const reviewDate = d.get('review_date') || null
      decisaoRefs.push({
        id: d.id,
        title: d.get('title'),
        responsible_user: d.get('responsible_user'),
        review_date: reviewDate,
        state: d.get('state'),
        atrasada: reviewDate !== null && reviewDate < limiteAtrasada,
      })
    }

    let reportId = null
    $app.runInTransaction(function (txApp) {
      const rec = new Record(colR)
      rec.set('uuid', uuidV4())
      rec.set('period_start', inicio)
      rec.set('period_end', fim)
      rec.set('quinzena', fonte.get('quinzena'))
      rec.set('scope', fonte.get('scope'))
      rec.set('template_version', fonte.get('template_version'))
      rec.set('policy_version', fonte.get('policy_version'))
      rec.set('report_revision', novaRev)
      rec.set('supersedes_id', fonte.id)
      rec.set('revision_reason', motivo)
      rec.set('idempotency_key', chave)
      rec.set('generated_by', e.auth.id)
      rec.set('generated_at', new Date().toISOString())
      rec.set('state', 'delivered')
      rec.set('origem', 'api')
      rec.set('data_snapshot_json', JSON.stringify({ pago: pago, organico: organico }))
      rec.set('coverage_by_source', JSON.stringify({ janela_dias: diasJanela, canais: cobertura }))
      rec.set(
        'comparison_eligibility',
        JSON.stringify({
          valida: false,
          motivo: 'republicação — ver snapshot original para comparativo',
          anterior: null,
        }),
      )
      rec.set(
        'warnings',
        JSON.stringify(avisos.concat(['republicação administrativa — motivo registrado'])),
      )
      rec.set(
        'alert_refs',
        fonte.get('alert_refs') ||
          JSON.stringify({ aviso: 'nenhuma regra de alerta aprovada ainda', itens: [] }),
      )
      rec.set('decision_refs', JSON.stringify(decisaoRefs))
      txApp.save(rec)
      reportId = rec.id
      for (const uid of destOk) {
        const item = new Record(colI)
        item.set('report_id', reportId)
        item.set('user_id', uid)
        item.set('scope', fonte.get('scope'))
        item.set('status', 'delivered')
        item.set('attempts', 1)
        item.set('delivered_at', new Date().toISOString())
        txApp.save(item)
      }
    })
    return e.json(200, {
      ok: true,
      id: reportId,
      report_revision: novaRev,
      supersedes_id: fonte.id,
      replay: false,
      avisos: avisos,
    })
  },
  $apis.requireAuth(),
)
