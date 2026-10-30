/// <reference path="../pb_data/types.d.ts" />
/**
 * Radiografia da base do CRM (30/10) — só leitura, só gestão.
 *
 * GET /backend/v1/crm/radiografia
 *   Devolve a contagem por status/origem, os leads com status "fechado",
 *   os "perdido", e os telefones que parecem internos da empresa.
 *
 * Serve para o dono conferir a qualidade do funil sem abrir lead a lead:
 *   - fechado sem valor (venda não registrada)
 *   - perdido que é número de vendedor (não é lead)
 *   - base importada sem data
 */

routerAdd(
  'GET',
  '/backend/v1/crm/radiografia',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    function lista(raw) {
      try {
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          return JSON.parse(String.fromCharCode.apply(null, raw))
        }
        if (typeof raw === 'string') return JSON.parse(raw)
        return raw || []
      } catch (err) {
        return []
      }
    }

    const colG = $app.findCollectionByNameOrId('access_grants')
    var meus = []
    try {
      meus = $app.findRecordsByFilter(
        colG,
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        50,
        0,
      )
    } catch (eG) {}
    var ehGestao = false
    for (const g of meus) {
      const acts = lista(g.get('actions'))
      const esc = lista(g.get('scope_accounts'))
      if (
        esc.indexOf('*') >= 0 &&
        (acts.indexOf('read_leads') >= 0 || acts.indexOf('read_metrics') >= 0)
      ) {
        ehGestao = true
      }
    }
    if (!ehGestao) return e.json(403, { ok: false, erro: 'só a gestão (escopo *)' })

    const INTERNOS = [
      '30359355',
      '30359361',
      '32833667',
      '4197213499',
      '4197206353',
      '4195017280',
      '4198008695',
    ]

    const colL = $app.findCollectionByNameOrId('crm_leads')
    var leads = []
    try {
      leads = $app.findRecordsByFilter(colL, 'fixture=false', '', 6000, 0)
    } catch (eL) {}

    const status = {}
    const origem = {}
    var semData = 0
    var comValor = 0
    var somaValor = 0
    const fechados = []
    const perdidos = []
    const internos = []

    for (const l of leads) {
      const st = String(l.get('status') || 'novo')
      const og = String(l.get('origem') || 'manual')
      status[st] = (status[st] || 0) + 1
      origem[og] = (origem[og] || 0) + 1
      const dl = String(l.get('data_lead') || '')
      if (dl === '') semData++
      const v = Number(l.get('valor') || 0)
      if (v > 0) {
        comValor++
        somaValor += v
      }
      const tel = String(l.get('telefone') || '').replace(/[^0-9]/g, '')
      var telInterno = false
      for (const i of INTERNOS) {
        if (tel === i || tel === '55' + i || tel.slice(-10) === i) telInterno = true
      }
      const resumo = {
        id: l.id,
        nome: String(l.get('nome') || ''),
        telefone: tel,
        origem: og,
        valor: v,
        data_lead: dl.slice(0, 10),
        criado: String(l.get('created') || '').slice(0, 10),
        interno: telInterno,
      }
      if (st === 'fechado') fechados.push(resumo)
      if (st === 'perdido') perdidos.push(resumo)
      if (telInterno) internos.push(resumo)
    }

    return e.json(200, {
      ok: true,
      total: leads.length,
      por_status: status,
      por_origem: origem,
      sem_data_lead: semData,
      leads_com_valor: comValor,
      soma_valor: Math.round(somaValor * 100) / 100,
      fechados: fechados,
      perdidos: perdidos,
      telefones_internos: internos,
    })
  },
  $apis.requireAuth(),
)
