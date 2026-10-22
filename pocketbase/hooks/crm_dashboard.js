/// <reference path="../pb_data/types.d.ts" />
/**
 * CRM dashboard (fase 4, card 5) — agregações do funil no servidor.
 *
 * GET /backend/v1/crm/dashboard (read_leads):
 *   - receita: ganha (soma das conversões sent+pending), perdida (0 — valor
 *     de perda não capturado no 1º momento), em_aberto (pipeline ativo)
 *   - ticket_medio (ganha / nº conversões)
 *   - taxa_conversao (fechados / decididos)
 *   - lead_time: média/mediana/min/max (entrada data_lead → conversão created)
 *   - por_estagio: contagem por status
 *   - por_origem: contagem por origem
 *   - criados_no_mes + media_dia (data_lead do mês corrente)
 *   - top_responsaveis: owner_id → {leads, fechados, valor}
 * JSVM: lógica INLINE; sort vazio (lição 22/10); fixture separado.
 */

routerAdd(
  'GET',
  '/backend/v1/crm/dashboard',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      50,
      0,
    )
    var temRead = false
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
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
      if (acts.indexOf('read_leads') >= 0) temRead = true
    }
    if (!temRead) {
      return e.json(403, { ok: false, erro: 'sem permissão para ver o dashboard (read_leads)' })
    }
    const ehFixture = String(e.auth.email || '').indexOf('.fixture.') >= 0
    const colL = $app.findCollectionByNameOrId('crm_leads')
    const leads = $app.findRecordsByFilter(
      colL,
      'fixture=' + (ehFixture ? 'true' : 'false'),
      '',
      2000,
      0,
    )
    // conversões (valor) — p/ receita e lead time
    const colConv = $app.findCollectionByNameOrId('conversion_events')
    const convs = $app.findRecordsByFilter(
      colConv,
      'fixture=' + (ehFixture ? 'true' : 'false'),
      '',
      2000,
      0,
    )
    const convPorLead = {}
    for (const c of convs) {
      const lid = String(c.get('lead_id'))
      const v = Number(c.get('valor') || 0)
      const criado = String(c.get('created') || '')
      if (!convPorLead[lid]) convPorLead[lid] = { valor: 0, quando: criado, n: 0 }
      convPorLead[lid].valor += v
      convPorLead[lid].n += 1
      if (criado < convPorLead[lid].quando || convPorLead[lid].quando === '')
        convPorLead[lid].quando = criado
    }
    // ---- receita ----
    var receitaGanha = 0
    var nConversoes = 0
    for (const c of convs) {
      receitaGanha += Number(c.get('valor') || 0)
      nConversoes++
    }
    // em aberto: leads não decididos (não fechado/perdido)
    var emAberto = 0
    var porEstagio = { novo: 0, em_contato: 0, orcamento: 0, fechado: 0, perdido: 0 }
    var porOrigem = {}
    var fechados = 0
    var perdidos = 0
    var criadosNoMes = 0
    const mesHoje = hoje.slice(0, 7)
    var diasComLead = {}
    const nomes = {}
    for (const l of leads) {
      const st = String(l.get('status') || 'novo')
      if (porEstagio[st] !== undefined) porEstagio[st]++
      if (st === 'fechado') fechados++
      if (st === 'perdido') perdidos++
      if (st !== 'fechado' && st !== 'perdido') emAberto++
      const o = String(l.get('origem') || 'manual')
      porOrigem[o] = (porOrigem[o] || 0) + 1
      const dl = String(l.get('data_lead') || '')
      const criado = String(l.get('created') || '')
      const dia = dl !== '' ? dl.slice(0, 10) : criado.slice(0, 10)
      if (dia.slice(0, 7) === mesHoje) {
        criadosNoMes++
        diasComLead[dia] = (diasComLead[dia] || 0) + 1
      }
      nomes[l.id] = String(l.get('nome') || '')
    }
    var taxa = null
    if (fechados + perdidos > 0) taxa = Math.round((fechados / (fechados + perdidos)) * 1000) / 10
    var ticketMedio = null
    if (nConversoes > 0) ticketMedio = Math.round((receitaGanha / nConversoes) * 100) / 100
    // ---- lead time (entrada → conversão) ----
    const leadTimes = []
    for (const lid in convPorLead) {
      const c = convPorLead[lid]
      let entrada = ''
      try {
        const l = $app.findRecordById('crm_leads', lid)
        entrada = String(l.get('data_lead') || l.get('created') || '')
      } catch (eL) {
        continue
      }
      if (entrada === '' || c.quando === '') continue
      const t1 = new Date(entrada.slice(0, 10) + 'T00:00:00Z').getTime()
      const t2 = new Date(c.quando.slice(0, 10) + 'T00:00:00Z').getTime()
      if (!Number.isFinite(t1) || !Number.isFinite(t2)) continue
      const dias = Math.max(0, (t2 - t1) / 86400000)
      leadTimes.push({ dias: Math.round(dias * 10) / 10, valor: c.valor, nome: nomes[lid] || '' })
    }
    var ltMedia = null
    var ltMediana = null
    var ltMin = null
    var ltMax = null
    if (leadTimes.length > 0) {
      const soma = leadTimes.reduce(function (a, b) {
        return a + b.dias
      }, 0)
      ltMedia = Math.round((soma / leadTimes.length) * 10) / 10
      const ordenados = leadTimes
        .map(function (x) {
          return x.dias
        })
        .sort(function (a, b) {
          return a - b
        })
      const meio = Math.floor(ordenados.length / 2)
      ltMediana =
        ordenados.length % 2 === 0
          ? Math.round(((ordenados[meio - 1] + ordenados[meio]) / 2) * 10) / 10
          : ordenados[meio]
      ltMin = ordenados[0]
      ltMax = ordenados[ordenados.length - 1]
    }
    // ---- top responsáveis ----
    const porOwner = {}
    for (const l of leads) {
      const ow = String(l.get('owner_id') || '')
      if (ow === '') continue
      if (!porOwner[ow]) porOwner[ow] = { leads: 0, fechados: 0, valor: 0 }
      porOwner[ow].leads++
      if (String(l.get('status')) === 'fechado') porOwner[ow].fechados++
      const cv = convPorLead[l.id]
      if (cv) porOwner[ow].valor += cv.valor
    }
    const topResponsaveis = []
    for (const ow in porOwner) {
      let nome = ow
      try {
        const u = $app.findRecordById('users', ow)
        nome = String(u.get('name') || u.get('email') || ow)
      } catch (eU) {}
      topResponsaveis.push({
        owner: ow,
        nome: nome,
        leads: porOwner[ow].leads,
        fechados: porOwner[ow].fechados,
        valor: Math.round(porOwner[ow].valor * 100) / 100,
      })
    }
    topResponsaveis.sort(function (a, b) {
      return b.valor - a.valor || b.fechados - a.fechados
    })
    // média/dia (mês corrente)
    var mediaDia = null
    const nDias = Object.keys(diasComLead).length
    if (nDias > 0) mediaDia = Math.round((criadosNoMes / nDias) * 10) / 10
    return e.json(200, {
      ok: true,
      receita: {
        ganha: Math.round(receitaGanha * 100) / 100,
        perdida: 0,
        em_aberto: emAberto,
        n_conversoes: nConversoes,
      },
      ticket_medio: ticketMedio,
      taxa_conversao: taxa,
      lead_time: {
        media: ltMedia,
        mediana: ltMediana,
        min: ltMin,
        max: ltMax,
        n: leadTimes.length,
      },
      por_estagio: porEstagio,
      por_origem: porOrigem,
      criados_no_mes: criadosNoMes,
      media_dia: mediaDia,
      top_responsaveis: topResponsaveis.slice(0, 5),
    })
  },
  $apis.requireAuth(),
)
