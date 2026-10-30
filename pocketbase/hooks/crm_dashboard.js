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
    var temTudo = false
    const contas = []
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
      if (acts.indexOf('read_leads') >= 0) {
        temRead = true
        // escopo da carteira: '*' = tudo; vazio = só o próprio (deny por padrão).
        // Mesma regra da rota /crm/leads (falha de privacidade de 28/10).
        let sa = []
        try {
          const ra = g.get('scope_accounts')
          sa =
            Array.isArray(ra) && ra.length > 0 && typeof ra[0] === 'number'
              ? JSON.parse(String.fromCharCode.apply(null, ra))
              : typeof ra === 'string'
                ? JSON.parse(ra)
                : ra || []
        } catch (e3) {}
        if (!Array.isArray(sa)) sa = []
        if (sa.indexOf('*') >= 0) temTudo = true
        for (const c of sa) if (c !== '*' && contas.indexOf(String(c)) < 0) contas.push(String(c))
      }
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
    // ESCOPO (30/10): vendedor vê os números DELE, não o consolidado da
    // empresa. Antes o dashboard somava a base inteira — o Fábio abria o CRM
    // e via R$ 71.250 de receita e o ranking de todos os vendedores.
    const meusLeads = []
    for (const l of leads) {
      if (temTudo) {
        meusLeads.push(l)
        continue
      }
      if (String(l.get('owner_id') || '') !== e.auth.id) continue
      if (contas.length > 0) {
        const conta = String(l.get('conta_id') || '')
        var dentro = false
        for (const c of contas) {
          if (conta !== '' && conta.indexOf(c) >= 0) dentro = true
        }
        if (!dentro) continue
      }
      meusLeads.push(l)
    }
    const idsPermitidos = {}
    for (const l of meusLeads) idsPermitidos[l.id] = true

    // conversões (valor) — p/ receita e lead time
    const colConv = $app.findCollectionByNameOrId('conversion_events')
    const convsTodas = $app.findRecordsByFilter(
      colConv,
      'fixture=' + (ehFixture ? 'true' : 'false'),
      '',
      2000,
      0,
    )
    const convs = []
    for (const c of convsTodas) {
      if (temTudo) {
        convs.push(c)
        continue
      }
      if (idsPermitidos[String(c.get('lead_id'))]) convs.push(c)
    }
    const convPorLead = {}
    for (const c of convs) {
      // conversão em `erro` não é venda: fora do mapa por lead também
      if (String(c.get('estado') || '') === 'erro') continue
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
    // Duas fontes, sem contar duas vezes o mesmo lead:
    //  1) conversion_events (venda registrada no sistema, já na fila do Meta/Google)
    //  2) crm_leads.valor de lead fechado vindo da planilha da agência (histórico
    //     importado em 28/10 — essas vendas NÃO entram na fila de conversões,
    //     para não reenviar 2 meses de venda às plataformas)
    // Só conta venda REAL: conversão marcada como `erro` é registro morto
    // (teste de QA ou falha de envio) e não pode inflar receita, ticket nem
    // taxa de conversão. Antes somava tudo, e 3 conversões de teste entraram
    // como R$ 2.360 de faturamento.
    var receitaGanha = 0
    var nConversoes = 0
    for (const c of convs) {
      if (String(c.get('estado') || '') === 'erro') continue
      receitaGanha += Number(c.get('valor') || 0)
      nConversoes++
    }
    var receitaHistorico = 0
    var nVendasHistorico = 0
    var pipelineHistorico = 0
    for (const l of meusLeads) {
      const v = Number(l.get('valor') || 0)
      if (!(v > 0)) continue
      const lid = l.id
      const st = String(l.get('status') || 'novo')
      if (st === 'fechado') {
        // se já existe conversão registrada para este lead, o valor já está
        // contado acima — não soma de novo
        if (!convPorLead[lid]) {
          receitaHistorico += v
          nVendasHistorico++
        }
      } else if (st !== 'perdido') {
        pipelineHistorico += v
      }
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
    for (const l of meusLeads) {
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
    for (const l of meusLeads) {
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
    const receitaTotal = receitaGanha + receitaHistorico
    const nVendasTotal = nConversoes + nVendasHistorico
    var ticketTotal = null
    if (nVendasTotal > 0) ticketTotal = Math.round((receitaTotal / nVendasTotal) * 100) / 100
    // ---- por vendedor (nome vindo da planilha da agência) ----
    const porVendedor = {}
    for (const l of leads) {
      const vn = String(l.get('vendedor_nome') || '').trim()
      if (vn === '') continue
      if (!porVendedor[vn]) porVendedor[vn] = { leads: 0, fechados: 0, valor: 0, pipeline: 0 }
      porVendedor[vn].leads++
      const st = String(l.get('status') || 'novo')
      const v = Number(l.get('valor') || 0)
      if (st === 'fechado') {
        porVendedor[vn].fechados++
        porVendedor[vn].valor += v
      } else if (st !== 'perdido') {
        porVendedor[vn].pipeline += v
      }
    }
    const listaVendedores = []
    for (const vn in porVendedor) {
      listaVendedores.push({
        nome: vn,
        leads: porVendedor[vn].leads,
        fechados: porVendedor[vn].fechados,
        valor: Math.round(porVendedor[vn].valor * 100) / 100,
        pipeline: Math.round(porVendedor[vn].pipeline * 100) / 100,
      })
    }
    listaVendedores.sort(function (a, b) {
      return b.valor - a.valor || b.leads - a.leads
    })
    return e.json(200, {
      ok: true,
      receita: {
        ganha: Math.round(receitaTotal * 100) / 100,
        ganha_sistema: Math.round(receitaGanha * 100) / 100,
        ganha_historico: Math.round(receitaHistorico * 100) / 100,
        pipeline_historico: Math.round(pipelineHistorico * 100) / 100,
        perdida: 0,
        em_aberto: emAberto,
        n_conversoes: nVendasTotal,
        n_vendas_historico: nVendasHistorico,
      },
      ticket_medio: ticketTotal,
      por_vendedor: listaVendedores,
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
