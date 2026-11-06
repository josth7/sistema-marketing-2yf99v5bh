/// <reference path="../pb_data/types.d.ts" />
/**
 * Hooks do servidor — alertas por critério + fila de análise
 * (SPEC-2-002, card f7591165, CA-2-06/07) + ajustes da ata do workshop
 * antecipado (16/10, 05_entregas/criterios-alerta-aprovados.md):
 *
 * 1. TIPO DO RESULTADO É DESCRITIVO: a Meta não separa tipo (result_type null
 *    na fonte) e o Google marca 'conversoes' — o avaliador agrupa por
 *    canal+objetivo+natureza e registra o tipo da regra como descrição do
 *    alerta (sem filtrar por um tipo que a fonte não fornece).
 * 2. BASE MÍNIMA em métricas de razão (custo_por_resultado/cpc/cpm/ctr)
 *    compara o DENOMINADOR do período anterior (resultados/cliques/impressões);
 *    em métricas de soma compara o total anterior.
 *
 * cronAdd global 'alerta_avaliador_diario' 09:15 UTC — ATIVADO por autorização
 * do dono (migração 0034; workshop antecipado 16/10). A MESMA lógica vive
 * inline em: callback do cron (cópia A) e rota tick (cópia B).
 *
 * Avaliador determinístico (sem IA, sem alteração de anúncios):
 * - só critérios state='approved' (draft/archived NUNCA disparam);
 * - somente o ÚLTIMO intervalo FECHADO antes de hojeRef, por period_kind:
 *   monthly = mês anterior completo; calendar_half = 1–15 / 16–último dia;
 * - período anterior = intervalo imediatamente anterior do MESMO tipo;
 * - comparação exige MESMA duração em dias e MESMA cobertura (dias com dados)
 *   nos dois períodos — diferença gera motivo de não elegibilidade, sem alerta;
 * - fonte: critérios de usuários fixture (criterios.fixture.*) leem a coleção
 *   ISOLADA alertas_fixtures; critérios reais leem metricas_diarias origem='api'
 *   (dataset demonstrativo NUNCA gera alerta);
 * - fórmula 100*(atual−anterior)/abs(anterior); base anterior null/0 ou
 *   < min_base não dispara; limiar INCLUSIVO (>= threshold p/ increase,
 *   <= −threshold p/ decrease);
 * - idempotência: UNIQUE (criterion_id, criterion_version, group_key,
 *   period_current_start, period_current_end) + busca antes de gravar;
 * - regra inválida não trava as demais (try/catch por critério).
 */

// ==================== CRON (lógica inline — cópia A) ====================
cronAdd('alerta_avaliador_diario', '15 9 * * *', () => {
  const hojeRef = new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
  const app = $app
  const resumo = {
    hojeRef: hojeRef,
    criterios: 0,
    alertas_criados: 0,
    nao_elegiveis: [],
    avisos: [],
  }
  avaliar(app, hojeRef, resumo)
  console.log('alerta_avaliador_diario: ' + JSON.stringify(resumo))

  function avaliar(app, hojeRef, resumo) {
    const colC = app.findCollectionByNameOrId('alert_criteria')
    const colA = app.findCollectionByNameOrId('alerts')
    const colM = app.findCollectionByNameOrId('metricas_diarias')
    let colF = null
    try {
      colF = app.findCollectionByNameOrId('alertas_fixtures')
    } catch (eF) {}
    const colU = app.findCollectionByNameOrId('users')

    const criterios = app.findRecordsByFilter(colC, "state='approved'", '-updated', 50, 0)
    resumo.criterios = criterios.length
    if (!criterios || criterios.length === 0) {
      resumo.avisos.push('nenhum critério aprovado — nada a avaliar')
      return
    }

    for (const c of criterios) {
      try {
        const metric = String(c.get('metric') || '')
        const canal = String(c.get('canal') || '')
        const objetivo = String(c.get('objetivo') || '')
        const resultType = c.get('result_type') ? String(c.get('result_type')) : null
        const natureza = String(c.get('natureza') || '')
        const direction = String(c.get('direction') || '')
        const threshold = numOuNull(c.get('threshold_pct'))
        const minBase = numOuNull(c.get('min_base'))
        const kind = String(c.get('period_kind') || '')
        const cid = c.id
        const cver = Number(c.get('version') || 1)
        const cuuid = String(c.get('uuid') || '')

        if (!metric || !canal || !direction || !threshold || !minBase || !kind) {
          resumo.nao_elegiveis.push({ criterio: cid, motivo: 'regra incompleta' })
          continue
        }

        let criadorEmail = ''
        try {
          const u = app.findRecordById(colU, String(c.get('created_by') || ''))
          criadorEmail = String(u.get('email') || '')
        } catch (eU) {}
        const ehFixture = criadorEmail.indexOf('criterios.fixture.') === 0
        const fonte = ehFixture ? colF : colM
        if (!fonte) {
          resumo.nao_elegiveis.push({ criterio: cid, motivo: 'coleção da fonte indisponível' })
          continue
        }

        const j = janelas(hojeRef, kind)
        const durA = duracaoDias(j.atual.inicio, j.atual.fim)
        const durP = duracaoDias(j.anterior.inicio, j.anterior.fim)
        const ehRazao =
          metric === 'cpc' ||
          metric === 'cpm' ||
          metric === 'ctr' ||
          metric === 'custo_por_resultado'

        function agregar(janela) {
          const filtro =
            "data >= '" +
            janela.inicio +
            "' && data <= '" +
            janela.fim +
            "' && canal='" +
            canal +
            "' && objetivo='" +
            objetivo +
            "' && natureza='" +
            natureza +
            "'"
          const registros = app.findRecordsByFilter(fonte, filtro, 'data', 2000, 0)
          const doGrupo = []
          const datas = {}
          for (const r of registros) {
            // tipo do resultado é DESCRITIVO (ata 16/10): a fonte Meta não separa
            // tipo e o Google marca 'conversoes' — sem filtro por tipo da regra
            doGrupo.push(r)
            datas[String(r.get('data')).slice(0, 10)] = true
          }
          const gasto = somar(
            doGrupo.map(function (r) {
              return numOuNull(r.get('gasto'))
            }),
          )
          const cliques = somar(
            doGrupo.map(function (r) {
              return numOuNull(r.get('cliques'))
            }),
          )
          const impr = somar(
            doGrupo.map(function (r) {
              return numOuNull(r.get('impressoes'))
            }),
          )
          const res = somar(
            doGrupo.map(function (r) {
              return numOuNull(r.get('resultados'))
            }),
          )
          let total = null
          let den = null
          if (metric === 'cpc') {
            total = razao(gasto, cliques)
            den = cliques
          } else if (metric === 'cpm') {
            total = gasto === null ? null : razao(gasto * 1000, impr)
            den = impr
          } else if (metric === 'ctr') {
            total = impr ? razao((cliques || 0) * 100, impr) : null
            den = impr
          } else if (metric === 'custo_por_resultado') {
            total = razao(gasto, res)
            den = res
          } else {
            const valores = []
            for (const r of doGrupo) valores.push(numOuNull(r.get(metric)))
            total = somar(valores)
          }
          return { total: total, dias: Object.keys(datas).length, den: den }
        }

        const aggA = agregar(j.atual)
        const aggP = agregar(j.anterior)

        // períodos de calendário são COMPLETOS por construção (ata 16/10):
        // mensal compara mês fechado vs mês fechado (30↔31 dias comparáveis);
        // quinzena compara quinzena vs quinzena. Proteção real = cobertura igual
        // de dias com dados + base mínima. (A leitura literal "mesma duração"
        // bloquearia regras mensais em 8 meses por ano — set 30 vs ago 31.)
        if (aggA.dias !== aggP.dias) {
          resumo.nao_elegiveis.push({
            criterio: cid,
            motivo:
              'cobertura desigual (' +
              aggP.dias +
              ' dia(s) na base vs ' +
              aggA.dias +
              ' no período atual)',
          })
          continue
        }
        // base: razão → denominador anterior; soma → total anterior (ata 16/10)
        const baseValor = ehRazao ? aggP.den : aggP.total
        if (baseValor === null || baseValor === 0) {
          resumo.nao_elegiveis.push({ criterio: cid, motivo: 'base anterior ausente ou zero' })
          continue
        }
        if (minBase !== null && baseValor < minBase) {
          resumo.nao_elegiveis.push({
            criterio: cid,
            motivo: 'base anterior ' + baseValor + ' < base mínima ' + minBase,
          })
          continue
        }
        if (aggA.total === null) {
          resumo.nao_elegiveis.push({ criterio: cid, motivo: 'valor atual indisponível' })
          continue
        }

        const variacao = (100 * (aggA.total - aggP.total)) / Math.abs(aggP.total)
        const cruza = direction === 'decrease' ? variacao <= -threshold : variacao >= threshold
        if (!cruza) {
          resumo.nao_elegiveis.push({
            criterio: cid,
            motivo: 'variação ' + variacao.toFixed(1) + '% não cruza o limiar ' + threshold + '%',
          })
          continue
        }

        const groupKey = canal + '|' + objetivo + '|' + (resultType || '-') + '|' + natureza
        const filtroDup =
          "criterion_id='" +
          cid +
          "' && criterion_version=" +
          cver +
          " && group_key='" +
          groupKey +
          "' && period_current_start='" +
          j.atual.inicio +
          "' && period_current_end='" +
          j.atual.fim +
          "'"
        const existentes = app.findRecordsByFilter(colA, filtroDup, '', 1, 0)
        if (existentes && existentes.length > 0) continue

        const rec = new Record(colA)
        rec.set('criterion_id', cid)
        rec.set('criterion_uuid', cuuid)
        rec.set('criterion_version', cver)
        rec.set('group_key', groupKey)
        rec.set('metric', metric)
        rec.set('canal', canal)
        rec.set('objetivo', objetivo)
        if (resultType) rec.set('result_type', resultType)
        rec.set('natureza', natureza)
        rec.set('direction', direction)
        rec.set('period_kind', kind)
        rec.set('period_current_start', j.atual.inicio)
        rec.set('period_current_end', j.atual.fim)
        rec.set('period_prev_start', j.anterior.inicio)
        rec.set('period_prev_end', j.anterior.fim)
        rec.set('current_value', aggA.total)
        rec.set('previous_value', aggP.total)
        rec.set('variation_pct', Math.round(variacao * 10) / 10)
        const sentido = direction === 'decrease' ? 'queda' : 'alta'
        rec.set(
          'trigger_summary',
          metric +
            ' (' +
            canal +
            ' · ' +
            objetivo +
            ' · ' +
            natureza +
            '): ' +
            sentido +
            ' de ' +
            Math.abs(variacao).toFixed(1) +
            '% — ' +
            aggP.total +
            ' → ' +
            aggA.total +
            ' (limiar ' +
            threshold +
            '%)',
        )
        try {
          rec.set('responsible_user', String(c.get('responsible_user') || ''))
        } catch (eR) {}
        rec.set('state', 'open')
        rec.set(
          'history',
          JSON.stringify([
            {
              at: new Date().toISOString(),
              acao: 'alerta_gerado',
              criterio: cuuid + ' v' + cver,
              variacao_pct: Math.round(variacao * 10) / 10,
            },
          ]),
        )
        try {
          app.save(rec)
          resumo.alertas_criados++
        } catch (eSave) {
          resumo.avisos.push('duplicata bloqueada pelo índice: ' + String(eSave).slice(0, 80))
        }
      } catch (eC) {
        resumo.avisos.push('critério ' + String(c && c.id) + ': ' + String(eC).slice(0, 120))
      }
    }
  }

  function ultimoDiaDoMes(anoMes) {
    const partes = String(anoMes).split('-')
    const ano = Number(partes[0])
    const mes = Number(partes[1])
    if (mes === 12) return ano + '-12-31'
    const prox = new Date(Date.UTC(ano, mes, 1) - 86400000)
    return prox.toISOString().slice(0, 10)
  }
  function duracaoDias(inicio, fim) {
    return (
      Math.round(
        (new Date(fim + 'T00:00:00Z').getTime() - new Date(inicio + 'T00:00:00Z').getTime()) /
          86400000,
      ) + 1
    )
  }
  function janelas(hojeRef, kind) {
    const ano = Number(hojeRef.slice(0, 4))
    const mes = Number(hojeRef.slice(5, 7))
    const dia = Number(hojeRef.slice(8, 10))
    function mesAnt(ano, mes) {
      return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano: ano, mes: mes - 1 }
    }
    function pad(n) {
      return n < 10 ? '0' + n : '' + n
    }
    if (kind === 'monthly') {
      const atual = mesAnt(ano, mes)
      const anterior = mesAnt(atual.ano, atual.mes)
      return {
        atual: {
          inicio: atual.ano + '-' + pad(atual.mes) + '-01',
          fim: ultimoDiaDoMes(atual.ano + '-' + pad(atual.mes)),
        },
        anterior: {
          inicio: anterior.ano + '-' + pad(anterior.mes) + '-01',
          fim: ultimoDiaDoMes(anterior.ano + '-' + pad(anterior.mes)),
        },
      }
    }
    let atual, anterior
    if (dia >= 16) {
      atual = { inicio: ano + '-' + pad(mes) + '-01', fim: ano + '-' + pad(mes) + '-15' }
      const p = mesAnt(ano, mes)
      anterior = {
        inicio: p.ano + '-' + pad(p.mes) + '-16',
        fim: ultimoDiaDoMes(p.ano + '-' + pad(p.mes)),
      }
    } else {
      const p = mesAnt(ano, mes)
      atual = {
        inicio: p.ano + '-' + pad(p.mes) + '-16',
        fim: ultimoDiaDoMes(p.ano + '-' + pad(p.mes)),
      }
      anterior = { inicio: p.ano + '-' + pad(p.mes) + '-01', fim: p.ano + '-' + pad(p.mes) + '-15' }
    }
    return { atual: atual, anterior: anterior }
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
  function razao(num, den) {
    if (num === null || den === null || den === 0) return null
    return num / den
  }
})

// ==================== ROTA TICK (relógio de teste — cópia B idêntica) ====================
routerAdd(
  'POST',
  '/backend/v1/alerts/tick',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const body = e.requestInfo().body || {}
    const hojeRef = body.data
      ? String(body.data)
      : new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(hojeRef)) {
      return e.json(422, {
        ok: false,
        erro: 'entrada inválida',
        campos: { data: 'formato AAAA-MM-DD' },
      })
    }

    function ultimoDiaDoMes(anoMes) {
      const partes = String(anoMes).split('-')
      const ano = Number(partes[0])
      const mes = Number(partes[1])
      if (mes === 12) return ano + '-12-31'
      const prox = new Date(Date.UTC(ano, mes, 1) - 86400000)
      return prox.toISOString().slice(0, 10)
    }
    function duracaoDias(inicio, fim) {
      return (
        Math.round(
          (new Date(fim + 'T00:00:00Z').getTime() - new Date(inicio + 'T00:00:00Z').getTime()) /
            86400000,
        ) + 1
      )
    }
    function janelas(hojeRef, kind) {
      const ano = Number(hojeRef.slice(0, 4))
      const mes = Number(hojeRef.slice(5, 7))
      const dia = Number(hojeRef.slice(8, 10))
      function mesAnt(ano, mes) {
        return mes === 1 ? { ano: ano - 1, mes: 12 } : { ano: ano, mes: mes - 1 }
      }
      function pad(n) {
        return n < 10 ? '0' + n : '' + n
      }
      if (kind === 'monthly') {
        const atual = mesAnt(ano, mes)
        const anterior = mesAnt(atual.ano, atual.mes)
        return {
          atual: {
            inicio: atual.ano + '-' + pad(atual.mes) + '-01',
            fim: ultimoDiaDoMes(atual.ano + '-' + pad(atual.mes)),
          },
          anterior: {
            inicio: anterior.ano + '-' + pad(anterior.mes) + '-01',
            fim: ultimoDiaDoMes(anterior.ano + '-' + pad(anterior.mes)),
          },
        }
      }
      let atual, anterior
      if (dia >= 16) {
        atual = { inicio: ano + '-' + pad(mes) + '-01', fim: ano + '-' + pad(mes) + '-15' }
        const p = mesAnt(ano, mes)
        anterior = {
          inicio: p.ano + '-' + pad(p.mes) + '-16',
          fim: ultimoDiaDoMes(p.ano + '-' + pad(p.mes)),
        }
      } else {
        const p = mesAnt(ano, mes)
        atual = {
          inicio: p.ano + '-' + pad(p.mes) + '-16',
          fim: ultimoDiaDoMes(p.ano + '-' + pad(p.mes)),
        }
        anterior = {
          inicio: p.ano + '-' + pad(p.mes) + '-01',
          fim: p.ano + '-' + pad(p.mes) + '-15',
        }
      }
      return { atual: atual, anterior: anterior }
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
    function razao(num, den) {
      if (num === null || den === null || den === 0) return null
      return num / den
    }

    const app = $app
    const resumo = {
      hojeRef: hojeRef,
      criterios: 0,
      alertas_criados: 0,
      nao_elegiveis: [],
      avisos: [],
    }
    const colC = app.findCollectionByNameOrId('alert_criteria')
    const colA = app.findCollectionByNameOrId('alerts')
    const colM = app.findCollectionByNameOrId('metricas_diarias')
    let colF = null
    try {
      colF = app.findCollectionByNameOrId('alertas_fixtures')
    } catch (eF) {}
    const colU = app.findCollectionByNameOrId('users')

    const criterios = app.findRecordsByFilter(colC, "state='approved'", '-updated', 50, 0)
    resumo.criterios = criterios.length
    if (!criterios || criterios.length === 0) {
      resumo.avisos.push('nenhum critério aprovado — nada a avaliar')
      return e.json(200, { ok: true, tick: resumo })
    }

    for (const c of criterios) {
      try {
        const metric = String(c.get('metric') || '')
        const canal = String(c.get('canal') || '')
        const objetivo = String(c.get('objetivo') || '')
        const resultType = c.get('result_type') ? String(c.get('result_type')) : null
        const natureza = String(c.get('natureza') || '')
        const direction = String(c.get('direction') || '')
        const threshold = numOuNull(c.get('threshold_pct'))
        const minBase = numOuNull(c.get('min_base'))
        const kind = String(c.get('period_kind') || '')
        const cid = c.id
        const cver = Number(c.get('version') || 1)
        const cuuid = String(c.get('uuid') || '')

        if (!metric || !canal || !direction || !threshold || !minBase || !kind) {
          resumo.nao_elegiveis.push({ criterio: cid, motivo: 'regra incompleta' })
          continue
        }

        let criadorEmail = ''
        try {
          const u = app.findRecordById(colU, String(c.get('created_by') || ''))
          criadorEmail = String(u.get('email') || '')
        } catch (eU) {}
        const ehFixture = criadorEmail.indexOf('criterios.fixture.') === 0
        const fonte = ehFixture ? colF : colM
        if (!fonte) {
          resumo.nao_elegiveis.push({ criterio: cid, motivo: 'coleção da fonte indisponível' })
          continue
        }

        const j = janelas(hojeRef, kind)
        const durA = duracaoDias(j.atual.inicio, j.atual.fim)
        const durP = duracaoDias(j.anterior.inicio, j.anterior.fim)
        const ehRazao =
          metric === 'cpc' ||
          metric === 'cpm' ||
          metric === 'ctr' ||
          metric === 'custo_por_resultado'

        function agregar(janela) {
          const filtro =
            "data >= '" +
            janela.inicio +
            "' && data <= '" +
            janela.fim +
            "' && canal='" +
            canal +
            "' && objetivo='" +
            objetivo +
            "' && natureza='" +
            natureza +
            "'"
          const registros = app.findRecordsByFilter(fonte, filtro, 'data', 2000, 0)
          const doGrupo = []
          const datas = {}
          for (const r of registros) {
            doGrupo.push(r)
            datas[String(r.get('data')).slice(0, 10)] = true
          }
          const gasto = somar(
            doGrupo.map(function (r) {
              return numOuNull(r.get('gasto'))
            }),
          )
          const cliques = somar(
            doGrupo.map(function (r) {
              return numOuNull(r.get('cliques'))
            }),
          )
          const impr = somar(
            doGrupo.map(function (r) {
              return numOuNull(r.get('impressoes'))
            }),
          )
          const res = somar(
            doGrupo.map(function (r) {
              return numOuNull(r.get('resultados'))
            }),
          )
          let total = null
          let den = null
          if (metric === 'cpc') {
            total = razao(gasto, cliques)
            den = cliques
          } else if (metric === 'cpm') {
            total = gasto === null ? null : razao(gasto * 1000, impr)
            den = impr
          } else if (metric === 'ctr') {
            total = impr ? razao((cliques || 0) * 100, impr) : null
            den = impr
          } else if (metric === 'custo_por_resultado') {
            total = razao(gasto, res)
            den = res
          } else {
            const valores = []
            for (const r of doGrupo) valores.push(numOuNull(r.get(metric)))
            total = somar(valores)
          }
          return { total: total, dias: Object.keys(datas).length, den: den }
        }

        const aggA = agregar(j.atual)
        const aggP = agregar(j.anterior)

        // períodos de calendário são COMPLETOS por construção (ata 16/10):
        // mensal compara mês fechado vs mês fechado (30↔31 dias comparáveis);
        // quinzena compara quinzena vs quinzena. Proteção real = cobertura igual
        // de dias com dados + base mínima. (A leitura literal "mesma duração"
        // bloquearia regras mensais em 8 meses por ano — set 30 vs ago 31.)
        if (aggA.dias !== aggP.dias) {
          resumo.nao_elegiveis.push({
            criterio: cid,
            motivo:
              'cobertura desigual (' +
              aggP.dias +
              ' dia(s) na base vs ' +
              aggA.dias +
              ' no período atual)',
          })
          continue
        }
        const baseValor = ehRazao ? aggP.den : aggP.total
        if (baseValor === null || baseValor === 0) {
          resumo.nao_elegiveis.push({ criterio: cid, motivo: 'base anterior ausente ou zero' })
          continue
        }
        if (minBase !== null && baseValor < minBase) {
          resumo.nao_elegiveis.push({
            criterio: cid,
            motivo: 'base anterior ' + baseValor + ' < base mínima ' + minBase,
          })
          continue
        }
        if (aggA.total === null) {
          resumo.nao_elegiveis.push({ criterio: cid, motivo: 'valor atual indisponível' })
          continue
        }

        const variacao = (100 * (aggA.total - aggP.total)) / Math.abs(aggP.total)
        const cruza = direction === 'decrease' ? variacao <= -threshold : variacao >= threshold
        if (!cruza) {
          resumo.nao_elegiveis.push({
            criterio: cid,
            motivo: 'variação ' + variacao.toFixed(1) + '% não cruza o limiar ' + threshold + '%',
          })
          continue
        }

        const groupKey = canal + '|' + objetivo + '|' + (resultType || '-') + '|' + natureza
        const filtroDup =
          "criterion_id='" +
          cid +
          "' && criterion_version=" +
          cver +
          " && group_key='" +
          groupKey +
          "' && period_current_start='" +
          j.atual.inicio +
          "' && period_current_end='" +
          j.atual.fim +
          "'"
        const existentes = app.findRecordsByFilter(colA, filtroDup, '', 1, 0)
        if (existentes && existentes.length > 0) continue

        const rec = new Record(colA)
        rec.set('criterion_id', cid)
        rec.set('criterion_uuid', cuuid)
        rec.set('criterion_version', cver)
        rec.set('group_key', groupKey)
        rec.set('metric', metric)
        rec.set('canal', canal)
        rec.set('objetivo', objetivo)
        if (resultType) rec.set('result_type', resultType)
        rec.set('natureza', natureza)
        rec.set('direction', direction)
        rec.set('period_kind', kind)
        rec.set('period_current_start', j.atual.inicio)
        rec.set('period_current_end', j.atual.fim)
        rec.set('period_prev_start', j.anterior.inicio)
        rec.set('period_prev_end', j.anterior.fim)
        rec.set('current_value', aggA.total)
        rec.set('previous_value', aggP.total)
        rec.set('variation_pct', Math.round(variacao * 10) / 10)
        const sentido = direction === 'decrease' ? 'queda' : 'alta'
        rec.set(
          'trigger_summary',
          metric +
            ' (' +
            canal +
            ' · ' +
            objetivo +
            ' · ' +
            natureza +
            '): ' +
            sentido +
            ' de ' +
            Math.abs(variacao).toFixed(1) +
            '% — ' +
            aggP.total +
            ' → ' +
            aggA.total +
            ' (limiar ' +
            threshold +
            '%)',
        )
        try {
          rec.set('responsible_user', String(c.get('responsible_user') || ''))
        } catch (eR) {}
        rec.set('state', 'open')
        rec.set(
          'history',
          JSON.stringify([
            {
              at: new Date().toISOString(),
              acao: 'alerta_gerado',
              criterio: cuuid + ' v' + cver,
              variacao_pct: Math.round(variacao * 10) / 10,
            },
          ]),
        )
        try {
          app.save(rec)
          resumo.alertas_criados++
        } catch (eSave) {
          resumo.avisos.push('duplicata bloqueada pelo índice: ' + String(eSave).slice(0, 80))
        }
      } catch (eC) {
        resumo.avisos.push('critério ' + String(c && c.id) + ': ' + String(eC).slice(0, 120))
      }
    }
    return e.json(200, { ok: true, tick: resumo })
  },
  $apis.requireAuth(),
)

// ==================== GET /backend/v1/alerts (fila) ====================
routerAdd(
  'GET',
  '/backend/v1/alerts',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    var temRead = false
    {
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
        if (acts.indexOf('read_alerts') >= 0) temRead = true
      }
    }
    if (!temRead && !e.hasSuperuserAuth()) {
      return e.json(403, {
        ok: false,
        erro: 'sem permissão para ler alertas (read_alerts) — fale com o administrador',
      })
    }
    const colA = $app.findCollectionByNameOrId('alerts')
    const registros = $app.findRecordsByFilter(colA, '', '-created', 200, 0)
    const itens = []
    for (const r of registros) {
      let respEmail = null
      try {
        const ru = r.get('responsible_user')
        if (ru) {
          const u = $app.findRecordById('users', String(ru))
          respEmail = String(u.get('email') || '')
        }
      } catch (eU) {}
      itens.push({
        id: r.id,
        criterion_id: r.get('criterion_id'),
        criterion_uuid: r.get('criterion_uuid'),
        criterion_version: r.get('criterion_version'),
        group_key: r.get('group_key'),
        metric: r.get('metric'),
        canal: r.get('canal'),
        objetivo: r.get('objetivo'),
        result_type: r.get('result_type'),
        natureza: r.get('natureza'),
        direction: r.get('direction'),
        period_kind: r.get('period_kind'),
        period_current_start: r.get('period_current_start'),
        period_current_end: r.get('period_current_end'),
        period_prev_start: r.get('period_prev_start'),
        period_prev_end: r.get('period_prev_end'),
        current_value: r.get('current_value'),
        previous_value: r.get('previous_value'),
        variation_pct: r.get('variation_pct'),
        trigger_summary: r.get('trigger_summary'),
        responsible_user: r.get('responsible_user') || null,
        responsible_email: respEmail,
        decision_id: r.get('decision_id') || null,
        state: r.get('state'),
        history: r.get('history') || null,
        created: r.get('created'),
        updated: r.get('updated'),
      })
    }
    return e.json(200, { ok: true, itens: itens })
  },
  $apis.requireAuth(),
)

// ==================== PATCH /backend/v1/alerts/{id}/state (transição) ====================
routerAdd(
  'PATCH',
  '/backend/v1/alerts/{id}/state',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    var temManage = false
    {
      const hojeM = new Date().toISOString().slice(0, 10)
      const colG_M = $app.findCollectionByNameOrId('access_grants')
      const meusM = $app.findRecordsByFilter(
        colG_M,
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        50,
        0,
      )
      for (const g of meusM) {
        const ateM = String(g.get('valid_until') || '')
        if (ateM !== '' && ateM.slice(0, 10) < hojeM) continue
        let actsM = []
        try {
          const rawM = g.get('actions')
          if (Array.isArray(rawM) && rawM.length > 0 && typeof rawM[0] === 'number') {
            actsM = JSON.parse(String.fromCharCode.apply(null, rawM))
          } else if (typeof rawM === 'string') {
            actsM = JSON.parse(rawM)
          } else {
            actsM = rawM || []
          }
        } catch (eM) {}
        if (actsM.indexOf('manage_alerts') >= 0) temManage = true
      }
    }
    if (!temManage && !e.hasSuperuserAuth()) {
      return e.json(403, {
        ok: false,
        erro: 'sem permissão para operar alertas (manage_alerts) — fale com o administrador',
      })
    }
    let rec
    try {
      rec = $app.findRecordById('alerts', e.request.pathValue('id'))
    } catch (_) {
      return e.json(404, { ok: false, erro: 'alerta não encontrado' })
    }
    const body = e.requestInfo().body || {}
    const novo = String(body.state || '')
    const atual = String(rec.get('state') || '')
    const TRANSICOES = {
      open: ['in_review'],
      in_review: ['decided', 'closed'],
      decided: ['closed'],
      closed: [],
    }
    const permitidas = TRANSICOES[atual] || []
    if (permitidas.indexOf(novo) < 0) {
      return e.json(409, {
        ok: false,
        erro: 'transição ' + atual + ' → ' + (novo || '?') + ' não permitida',
      })
    }
    let decisionId = null
    let justificativa = null
    if (novo === 'decided') {
      decisionId = String(body.decision_id || '').trim()
      if (decisionId === '') {
        return e.json(422, {
          ok: false,
          erro: 'entrada inválida',
          campos: { decision_id: 'decidir exige a decisão vinculada (decision_id)' },
        })
      }
      try {
        $app.findRecordById('decisions', decisionId)
      } catch (_) {
        return e.json(422, {
          ok: false,
          erro: 'entrada inválida',
          campos: { decision_id: 'decisão não encontrada' },
        })
      }
    }
    if (novo === 'closed') {
      justificativa = String(body.justificativa || '').trim()
      if (justificativa === '') {
        return e.json(422, {
          ok: false,
          erro: 'entrada inválida',
          campos: { justificativa: 'encerrar exige justificativa (fica no histórico)' },
        })
      }
      if (atual === 'open' || atual === 'in_review') {
        const resp = String(rec.get('responsible_user') || '')
        if (resp !== '' && resp !== String(e.auth.id)) {
          return e.json(403, {
            ok: false,
            erro: 'fechamento direto é só do responsável pelo alerta',
          })
        }
      }
    }
    rec.set('state', novo)
    if (decisionId) rec.set('decision_id', decisionId)
    let hist = []
    try {
      const h = rec.get('history')
      // AP-2026-10-14-1155: json no JSVM volta PARSEADO — array de objetos OU
      // array de char-codes (string codificada). Ler só como string apagava
      // o histórico anterior a cada transição (achado pela prova ao vivo).
      if (Array.isArray(h)) {
        if (h.length > 0 && typeof h[0] === 'number') {
          hist = JSON.parse(String.fromCharCode.apply(null, h))
        } else {
          hist = h
        }
      } else if (typeof h === 'string' && h.length > 2) {
        hist = JSON.parse(h)
      }
    } catch (_) {}
    const entrada = {
      at: new Date().toISOString(),
      ator: e.auth.id,
      acao: 'transicao_' + atual + '_' + novo,
    }
    if (decisionId) entrada.decision_id = decisionId
    if (justificativa) entrada.justificativa = justificativa
    hist.push(entrada)
    rec.set('history', JSON.stringify(hist).slice(0, 1900000))
    try {
      $app.save(rec)
    } catch (eSaveSolto) {
      console.log('save falhou em alertas.js: ' + String(eSaveSolto).slice(0, 160))
    }
    return e.json(200, { ok: true, id: rec.id, state: novo })
  },
  $apis.requireAuth(),
)
