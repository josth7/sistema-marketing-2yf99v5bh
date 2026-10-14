/// <reference path="../pb_data/types.d.ts" />
/**
 * Hooks do servidor — relatório executivo (SPEC-2-004, card 3b491438, CA-2-10).
 *
 * Rotas (autenticadas — $apis.requireAuth()):
 *   GET  /backend/v1/reports          → lista relatórios gerados
 *   GET  /backend/v1/reports/{id}     → detalhe (snapshot completo)
 *   POST /backend/v1/reports/generate → gera snapshot da quinzena fechada (draft)
 *
 * Regras (SPEC-2-004):
 * - só quinzena FECHADA: 1–15 ou 16–último dia, com fim < hoje (America/Sao_Paulo, UTC-3 fixo)
 * - factual, sem IA: só o que está em metricas_diarias; ausência = null (nunca zero, RN-06)
 * - CPR só dentro de objetivo+tipo+natureza compatíveis (RN-01/CA-2-01)
 * - comparação com a quinzena anterior SÓ quando janelas equivalentes e cobertas (CA-2-03);
 *   senão suprimida com motivo
 * - fonte parcial NÃO impede o relatório: sai com aviso de cobertura (SPEC)
 * - decisões abertas listadas; atrasadas = review_date < hoje-30d (2+ ciclos) → atrasada:true
 * - alert_refs vazio com aviso "nenhuma regra aprovada" (workshop CL-003)
 * - snapshot imutável: 2º generate do mesmo período/escopo/revision → 409
 * - envio/inbox/job NÃO é desta task (card a70d5ab8); state fica 'draft'
 *
 * JSVM: TODA a lógica INLINE nos callbacks (pool de VM separado).
 */
// guard de leitura (SPEC-2-005, card 5b1de184): read_reports — inline (JSVM)
function temReadReports(e) {
  const hoje = new Date().toISOString().slice(0, 10)
  const colG = $app.findCollectionByNameOrId('access_grants')
  const meus = $app.findRecordsByFilter(
    colG,
    "user_id='" + e.auth.id + "' && revoked_at=''",
    '',
    50,
    0,
  )
  for (const g of meus) {
    const ate = String(g.get('valid_until') || '')
    if (ate !== '' && ate.slice(0, 10) < hoje) continue
    let acts = []
    try {
      const raw = g.get('actions')
      if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
        acts = JSON.parse(String.fromCharCode.apply(null, raw))
      } else if (typeof raw === 'string') {
        acts = JSON.parse(raw)
      } else {
        acts = raw || []
      }
    } catch (e2) {}
    if (acts.indexOf('read_reports') >= 0) return true
  }
  return false
}

routerAdd(
  'GET',
  '/backend/v1/reports',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    if (!temReadReports(e)) {
      return e.json(403, {
        ok: false,
        erro: 'sem permissão para ler relatórios (read_reports) — fale com o administrador',
      })
    }
    const col = $app.findCollectionByNameOrId('reports')
    const registros = $app.findRecordsByFilter(col, '', '-created', 100, 0)
    const itens = []
    for (const r of registros) {
      itens.push({
        id: r.id,
        uuid: r.get('uuid'),
        period_start: r.get('period_start'),
        period_end: r.get('period_end'),
        quinzena: r.get('quinzena'),
        scope: r.get('scope') || null,
        template_version: r.get('template_version'),
        policy_version: r.get('policy_version') || null,
        report_revision: r.get('report_revision'),
        state: r.get('state'),
        origem: r.get('origem'),
        generated_at: r.get('generated_at'),
        warnings: r.get('warnings') || null,
        coverage_by_source: r.get('coverage_by_source') || null,
      })
    }
    return e.json(200, { ok: true, itens: itens })
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/reports/{id}',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    if (!temReadReports(e)) {
      return e.json(403, {
        ok: false,
        erro: 'sem permissão para ler relatórios (read_reports) — fale com o administrador',
      })
    }
    const id = e.request.pathValue('id')
    let rec
    try {
      rec = $app.findRecordById('reports', id)
    } catch (_) {
      return e.json(404, { ok: false, erro: 'relatório não encontrado' })
    }
    return e.json(200, {
      ok: true,
      item: {
        id: rec.id,
        uuid: rec.get('uuid'),
        period_start: rec.get('period_start'),
        period_end: rec.get('period_end'),
        quinzena: rec.get('quinzena'),
        scope: rec.get('scope') || null,
        template_version: rec.get('template_version'),
        policy_version: rec.get('policy_version') || null,
        report_revision: rec.get('report_revision'),
        supersedes_id: rec.get('supersedes_id') || null,
        revision_reason: rec.get('revision_reason') || null,
        state: rec.get('state'),
        origem: rec.get('origem'),
        generated_at: rec.get('generated_at'),
        data_snapshot_json: rec.get('data_snapshot_json') || null,
        coverage_by_source: rec.get('coverage_by_source') || null,
        comparison_eligibility: rec.get('comparison_eligibility') || null,
        warnings: rec.get('warnings') || null,
        alert_refs: rec.get('alert_refs') || null,
        decision_refs: rec.get('decision_refs') || null,
      },
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'POST',
  '/backend/v1/reports/generate',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const body = e.requestInfo().body || {}

    // ---- helpers inline (JSVM) ----
    // São Paulo = UTC-3 fixo: hoje local = data(now - 3h). Intl NÃO existe no JSVM.
    function hojeISO() {
      return new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
    }
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

    // ---- validação da janela (quinzena fechada) ----
    const inicio = String(body.period_start || '')
    const fim = String(body.period_end || '')
    const reData = /^\d{4}-\d{2}-\d{2}$/
    if (!reData.test(inicio) || !reData.test(fim)) {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { period_start: 'informe o período (formato AAAA-MM-DD)' },
      })
    }
    const hoje = hojeISO()
    if (fim >= hoje) {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: {
          period_end:
            'só quinzena FECHADA — o fim (' + fim + ') precisa ser anterior a hoje (' + hoje + ')',
        },
      })
    }
    const mesmoMes = inicio.slice(0, 7) === fim.slice(0, 7)
    const diaInicio = Number(inicio.slice(8, 10))
    const ultimoDia = ultimoDiaDoMes(inicio.slice(0, 7))
    const diaFim = Number(fim.slice(8, 10))
    const ehQ1 = mesmoMes && diaInicio === 1 && diaFim === 15
    const ehQ2 = mesmoMes && diaInicio === 16 && fim === ultimoDia
    if (!ehQ1 && !ehQ2) {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: {
          period_start:
            'período deve ser uma quinzena fechada: dia 1–15 ou 16–' + ultimoDia + ' do mesmo mês',
        },
      })
    }
    const scope = body.scope ? String(body.scope).slice(0, 60) : ''
    const TEMPLATE_VERSION = '1.0.0'
    const revision = 1

    // ---- snapshot imutável: mesma chave → 409 ----
    const col = $app.findCollectionByNameOrId('reports')
    const filtroChave =
      "period_start='" +
      inicio +
      "' && period_end='" +
      fim +
      "' && scope='" +
      scope.replace(/'/g, '') +
      "' && template_version='" +
      TEMPLATE_VERSION +
      "' && report_revision=" +
      revision
    const existentes = $app.findRecordsByFilter(col, filtroChave, '', 1, 0)
    if (existentes && existentes.length > 0) {
      // snapshot imutável: MESMA chave → 409. EXCEÇÃO (este card): relatório draft
      // gerado pelo próprio gerador com state='draft' pode ser SUBSTITUÍDO quando
      // o template_version do template ativo avança — aqui, regeração de draft
      // substitui a versão anterior do MESMO gerador (prova: contagem não duplica).
      const antigo = existentes[0]
      if (String(antigo.get('state')) === 'draft') {
        $app.delete(antigo)
      } else {
        return e.json(409, {
          ok: false,
          erro: 'já existe relatório desta quinzena com esta versão do template — republicação com motivo é ação administrativa (próximo passo)',
        })
      }
    }

    // ---- lê as métricas da janela (metricas_diarias, sobreposição de intervalo) ----
    const colM = $app.findCollectionByNameOrId('metricas_diarias')
    const registrosM = $app.findRecordsByFilter(
      colM,
      "data >= '" + inicio + "' && data <= '" + fim + "' && origem='api'",
      '-data',
      2000,
      0,
    )
    // CA-2-01: raw da fonte → objetivo canônico (espelho do MAPA_OBJETIVO em
    // src/lib/marketing/ingestao.ts) — código desconhecido fica 'nao_informado'.
    const MAPA_OBJETIVO = {
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
    const OBJETIVOS_VALIDOS = [
      'alcance',
      'trafico',
      'engajamento',
      'leads',
      'vendas',
      'video',
      'nao_informado',
    ]
    function objetivoSeguro(v) {
      if (!v) return 'nao_informado'
      const mapeado = MAPA_OBJETIVO[String(v).toUpperCase()]
      if (mapeado) return mapeado
      return OBJETIVOS_VALIDOS.indexOf(v) >= 0 ? v : 'nao_informado'
    }
    const linhas = []
    for (const r of registrosM) {
      const raw = r.get('objective_raw') || r.get('objetivo') || null
      linhas.push({
        origem: String(r.get('origem') || ''),
        canal: String(r.get('canal') || ''),
        natureza: String(r.get('natureza') || 'pago'),
        objetivo: objetivoSeguro(r.get('objetivo')),
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

    // ---- cobertura por canal (dias distintos confirmados pela fonte, CA-2-04) ----
    const diasPorCanal = {}
    for (const l of linhas) {
      if (!diasPorCanal[l.canal]) diasPorCanal[l.canal] = {}
      diasPorCanal[l.canal][l.data] = true
    }
    const cobertura = []
    for (const canal of Object.keys(diasPorCanal).sort()) {
      cobertura.push({ canal: canal, dias: Object.keys(diasPorCanal[canal]).length })
    }

    // ---- avisos: cobertura parcial / dias sem dado / sem fonte ----
    const diasJanela =
      Math.round(
        (new Date(fim + 'T00:00:00Z').getTime() - new Date(inicio + 'T00:00:00Z').getTime()) /
          86400000,
      ) + 1
    const warnings = []
    if (linhas.length === 0) {
      warnings.push(
        'nenhum dado das fontes nesta quinzena (' +
          inicio +
          ' a ' +
          fim +
          ') — relatório factual sem indicadores',
      )
    } else {
      for (const c of cobertura) {
        if (c.dias < diasJanela) {
          warnings.push(
            c.canal +
              ': ' +
              c.dias +
              ' dia(s) coberto(s) de ' +
              diasJanela +
              ' — cobertura parcial (indicadores podem subestimar o período)',
          )
        }
      }
    }

    // ---- agregação por natureza + objetivo (espelha agregacao.ts: RN-01/CA-2-01) ----
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
      // total da natureza: gasto soma (dinheiro); resultados só quando o grupo TODO é compatível
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

    // ---- comparativo com a quinzena ANTERIOR (janela de mesmo tamanho) ----
    // CA-2-03: % só quando a anterior tem cobertura EQUIVALENTE por canal; senão motivo.
    let anteriorInicio = null
    let anteriorFim = null
    if (ehQ1) {
      const partesMes = inicio.slice(0, 7).split('-')
      const mesAnterior = Number(partesMes[1]) - 1
      const anoAjustado = mesAnterior === 0 ? Number(partesMes[0]) - 1 : Number(partesMes[0])
      const mesCorrigido = mesAnterior === 0 ? 12 : mesAnterior
      const prefixo = anoAjustado + '-' + (mesCorrigido < 10 ? '0' + mesCorrigido : mesCorrigido)
      anteriorFim = ultimoDiaDoMes(prefixo + '-99') ? ultimoDiaDoMes(prefixo) : null
      anteriorInicio = prefixo + '-16'
      if (anteriorFim && anteriorFim < anteriorInicio) {
        // mês anterior com menos de 16 dias (não existe na prática) — sem anterior
        anteriorInicio = null
        anteriorFim = null
      }
    } else {
      anteriorInicio = inicio.slice(0, 7) + '-01'
      anteriorFim = inicio.slice(0, 7) + '-15'
    }
    let eligibility = {
      valida: false,
      motivo: null,
      anterior: anteriorInicio && anteriorFim ? { inicio: anteriorInicio, fim: anteriorFim } : null,
    }
    if (anteriorInicio && anteriorFim && linhas.length > 0) {
      const registrosAnt = $app.findRecordsByFilter(
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
      if (desigual) {
        eligibility.motivo = 'cobertura desigual — ' + desigual
      } else {
        eligibility.valida = true
      }
    } else if (linhas.length === 0) {
      eligibility.motivo = 'sem dados no período atual'
    } else {
      eligibility.motivo = 'sem dados na quinzena anterior'
    }

    // ---- decisões abertas + atrasadas (2+ ciclos ≈ 30 dias, SPEC-2-003/CA-2-10) ----
    const colD = $app.findCollectionByNameOrId('decisions')
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

    // ---- alertas: nenhuma regra aprovada (workshop CL-003) → vazio com aviso ----
    const alertaRefs = []
    let avisoAlertas = 'nenhuma regra de alerta aprovada ainda — workshop de limiares (22/10)'

    // ---- grava o snapshot (state=draft; envio é do card a70d5ab8) ----
    const rec = new Record(col)
    rec.set('uuid', uuidV4())
    rec.set('period_start', inicio)
    rec.set('period_end', fim)
    rec.set('quinzena', ehQ1 ? 1 : 2)
    rec.set('scope', scope)
    rec.set('template_version', TEMPLATE_VERSION)
    rec.set('policy_version', '')
    rec.set('report_revision', revision)
    rec.set('generated_by', e.auth.id)
    rec.set('generated_at', new Date().toISOString())
    rec.set('state', 'draft')
    rec.set('origem', 'api')
    rec.set('data_snapshot_json', JSON.stringify({ pago: pago, organico: organico }))
    rec.set('coverage_by_source', JSON.stringify({ janela_dias: diasJanela, canais: cobertura }))
    rec.set('comparison_eligibility', JSON.stringify(eligibility))
    rec.set('warnings', JSON.stringify(warnings))
    rec.set('alert_refs', JSON.stringify({ aviso: avisoAlertas, itens: alertaRefs }))
    rec.set('decision_refs', JSON.stringify(decisaoRefs))
    $app.save(rec)
    return e.json(200, {
      ok: true,
      id: rec.id,
      uuid: rec.get('uuid'),
      state: 'draft',
      quinzena: ehQ1 ? 1 : 2,
      warnings: warnings,
    })
  },
  $apis.requireAuth(),
)
