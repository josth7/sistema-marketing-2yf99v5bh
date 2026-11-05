/// <reference path="../pb_data/types.d.ts" />
/**
 * ATRIBUIÇÃO DAS CONVERSAS (05/11) — leitura, só gestão.
 *
 * Pergunta do dono: "como as 63 conversas sem resposta foram espelhadas ao
 * vendedor?". Esta rota responde com o dado, não com explicação:
 *
 *   para cada conversa da central com a última mensagem do CLIENTE:
 *     - o lead ligado a ela
 *     - o dono do lead (owner_id) e o nome dele
 *     - o número por onde a conversa entrou
 *     - se o dono do lead é o mesmo vendedor do número (coerência)
 *     - se o lead está sem dono
 *
 * Assim dá para ver quantas estão realmente na carteira de alguém, quantas
 * estão órfãs e quantas caíram no número errado.
 *
 * GET /backend/v1/diag/atribuicao
 */
routerAdd(
  'GET',
  '/backend/v1/diag/atribuicao',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = {
      ok: true,
      agora: new Date().toISOString(),
      esperando: 0,
      por_dono: {},
      sem_dono: 0,
      sem_lead: 0,
      numero_diferente_do_dono: 0,
      itens: [],
    }

    // ---------- conexões (id -> papel/dono/número) ----------
    const mapaCx = {}
    try {
      const cxs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        '',
        '',
        50,
        0,
      )
      for (const c of cxs) {
        mapaCx[c.id] = {
          numero: String(c.get('numero') || ''),
          nome: String(c.get('nome_exibicao') || ''),
          papel: String(c.get('papel') || ''),
          vendedor_user: String(c.get('vendedor_user') || ''),
          vendedor_nome: String(c.get('vendedor_nome') || ''),
        }
      }
    } catch (e0) {}

    // ---------- usuários (id -> nome) ----------
    const mapaU = {}
    try {
      const us = app.findRecordsByFilter(app.findCollectionByNameOrId('users'), '', '', 300, 0)
      for (const u of us) mapaU[u.id] = String(u.get('name') || u.get('email') || '')
    } catch (e1) {}

    // ---------- central ----------
    var central = null
    try {
      const c = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true",
        '',
        5,
        0,
      )
      if (c.length > 0) central = c[0]
    } catch (e2) {}
    if (!central) {
      out.ok = false
      out.erro = 'sem central ativa'
      return e.json(200, out)
    }

    // ---------- conversas da central ----------
    var conversas = []
    try {
      conversas = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "conexao='" + central.id + "'",
        '',
        1000,
        0,
      )
    } catch (e3) {
      out.ok = false
      out.erro = 'conversas: ' + String(e3).slice(0, 150)
      return e.json(200, out)
    }

    const colMsg = app.findCollectionByNameOrId('whatsapp_mensagens')
    const colL = app.findCollectionByNameOrId('crm_leads')

    for (const cv of conversas) {
      // última mensagem
      var ultimas = []
      try {
        ultimas = app.findRecordsByFilter(
          colMsg,
          "conexao='" +
            central.id +
            "' && contato_telefone='" +
            String(cv.get('contato_telefone') || '') +
            "'",
          '',
          4,
          0,
        )
      } catch (e4) {
        continue
      }
      if (ultimas.length === 0) continue
      ultimas.sort(function (a, b) {
        return String(b.get('enviada_em') || b.get('created') || '').localeCompare(
          String(a.get('enviada_em') || a.get('created') || ''),
        )
      })
      if (String(ultimas[0].get('direcao')) !== 'entrada') continue

      out.esperando++

      // lead e dono
      var lead = null
      const leadId = String(cv.get('lead') || '')
      if (leadId !== '') {
        try {
          lead = app.findRecordById(colL, leadId)
        } catch (e5) {}
      }
      const dono = lead ? String(lead.get('owner_id') || '') : ''
      const donoNome = dono !== '' ? mapaU[dono] || dono : ''

      if (leadId === '') out.sem_lead++
      else if (dono === '') out.sem_dono++

      // número por onde entrou
      const cx = mapaCx[String(cv.get('conexao') || '')] || {}

      // coerência: o dono do lead é o vendedor do número?
      var coerente = true
      if (dono !== '' && cx.vendedor_user && cx.vendedor_user !== dono) coerente = false
      if (!coerente) out.numero_diferente_do_dono++

      const chave = donoNome !== '' ? donoNome : '(sem dono)'
      out.por_dono[chave] = (out.por_dono[chave] || 0) + 1

      out.itens.push({
        nome: String(cv.get('contato_nome') || ''),
        telefone: String(cv.get('contato_telefone') || ''),
        estado: String(cv.get('estado') || ''),
        lead_id: leadId,
        dono: donoNome,
        numero_entrada: cx.nome || '',
        coerente: coerente,
        ultima_em: String(ultimas[0].get('enviada_em') || '').slice(0, 16),
      })
    }

    out.itens.sort(function (a, b) {
      return String(a.ultima_em).localeCompare(String(b.ultima_em))
    })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
