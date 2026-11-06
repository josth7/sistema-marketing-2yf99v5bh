/// <reference path="../pb_data/types.d.ts" />
/**
 * POR QUE O VENDEDOR NÃO VÊ (05/11) — leitura, só gestão.
 *
 * O dono diz: "no celular do vendedor não aparece e no sistema ele não
 * consegue responder". O rodízio gravou o dono no lead, mas as conversas não
 * aparecem para quem recebeu.
 *
 * Esta rota refaz, para um telefone, exatamente as checagens que a listagem e
 * a resposta fazem — e diz em qual delas para:
 *   - a conversa existe?
 *   - está na conexão central?
 *   - tem lead? qual o owner_id real?
 *   - o lead é `fixture`?
 *   - o telefone da conversa bate com o do lead?
 *
 * GET /backend/v1/diag/porque-nao-ve?telefone=5541XXXXXXXXX
 */
routerAdd(
  'GET',
  '/backend/v1/diag/pq-nao-ve',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const tel = String(e.request.url.query().get('telefone') || '').replace(/\D/g, '')
    if (tel === '') return e.json(422, { ok: false, erro: 'informe ?telefone=' })

    const out = { telefone: tel, conversas: [], passos: [] }

    var conversas = []
    try {
      conversas = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_conversas'),
        "contato_telefone='" + tel + "'",
        '',
        10,
        0,
      )
    } catch (e0) {
      out.erro = String(e0).slice(0, 160)
      return e.json(200, out)
    }
    out.total_conversas = conversas.length

    // mapa de conexões
    const mapaCx = {}
    try {
      const cxs = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_conexoes'),
        '',
        '',
        50,
        0,
      )
      for (const c of cxs) {
        mapaCx[c.id] = {
          nome: String(c.get('nome_exibicao') || ''),
          papel: String(c.get('papel') || ''),
          vendedor_user: String(c.get('vendedor_user') || ''),
        }
      }
    } catch (e1) {}

    for (const cv of conversas) {
      const cx = mapaCx[String(cv.get('conexao') || '')] || {}
      const leadId = String(cv.get('lead') || '')
      var lead = null
      if (leadId !== '') {
        try {
          lead = $app.findRecordById('crm_leads', leadId)
        } catch (e2) {}
      }
      out.conversas.push({
        id: cv.id,
        estado: String(cv.get('estado') || ''),
        conexao_nome: cx.nome || '(nao achada)',
        conexao_papel: cx.papel || '',
        conexao_vendedor_user: (cx.vendedor_user || '').slice(0, 12),
        lead_id: leadId,
        lead_existe: lead !== null,
        lead_nome: lead ? String(lead.get('nome') || '') : '',
        lead_telefone: lead ? String(lead.get('telefone') || '') : '',
        owner_id: lead ? String(lead.get('owner_id') || '') : '',
        lead_fixture: lead ? String(lead.get('fixture')) === 'true' : null,
        telefone_bate: lead ? String(lead.get('telefone') || '').replace(/\D/g, '') === tel : false,
      })
    }

    // o lead desse telefone, mesmo sem conversa
    try {
      const ls = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('crm_leads'),
        "telefone='" + tel + "'",
        '',
        5,
        0,
      )
      out.leads = []
      for (const l of ls) {
        out.leads.push({
          id: l.id,
          nome: String(l.get('nome') || ''),
          owner_id: String(l.get('owner_id') || ''),
          vendedor_nome: String(l.get('vendedor_nome') || ''),
          fixture: String(l.get('fixture')) === 'true',
          status: String(l.get('status') || ''),
        })
      }
    } catch (e3) {}

    return e.json(200, out)
  },
  $apis.requireAuth(),
)
