/// <reference path="../pb_data/types.d.ts" />
/**
 * DIVERGÊNCIA — cliente ouviu um vendedor, lead ficou com outro (17/11).
 *
 * O dono diz: "o cliente recebeu mensagem que o vendedor ia atender, mas não foi
 * para o CRM do vendedor".
 *
 * A primeira varredura mostrou 0 transferidas sem dono. Então o problema pode
 * ser DIVERGÊNCIA: a frase de transferência (aviso_cliente) diz o nome de um
 * vendedor e o lead está com outro. É o caso RN-135/RN-193.
 *
 * Aqui se compara, para cada conversa transferida:
 *   - o nome do vendedor dito ao cliente (texto do envio motivo='aviso_cliente')
 *   - o dono REAL do lead (crm_leads.owner_id)
 *
 * GET /backend/v1/check/divergencia
 */
routerAdd(
  'GET',
  '/backend/v1/check/divergencia',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, total_transferidas: 0, divergentes: [], sem_aviso: [], resumo: {} }

    // vendedores: user -> nome
    const nomePorUser = {}
    try {
      for (const c of app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor' && ativo=true && fixture=false",
        '',
        30,
        0,
      )) {
        const uid = String(c.get('vendedor_user') || '')
        if (uid !== '') nomePorUser[uid] = String(c.get('nome_exibicao') || '')
      }
    } catch (e0) {}

    var central = null
    try {
      const cs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true && fixture=false",
        '',
        1,
        0,
      )
      if (cs.length > 0) central = cs[0]
    } catch (e1) {}
    if (!central) return e.json(200, { ok: false })

    var cvs = []
    try {
      cvs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "conexao='" + central.id + "' && estado='transferida' && fixture=false",
        '',
        3000,
        0,
      )
    } catch (e2) {}
    out.total_transferidas = cvs.length

    for (const cv of cvs) {
      const tel = String(cv.get('contato_telefone') || '')
      const leadId = String(cv.get('lead') || '')
      if (leadId === '') continue

      var lead = null
      try {
        lead = app.findRecordById('crm_leads', leadId)
      } catch (eL) {}
      if (!lead) continue

      const ow = String(lead.get('owner_id') || '')
      const donoNome = nomePorUser[ow] || ''

      // o último aviso ao cliente dessa conversa
      var aviso = ''
      try {
        const envs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_envios'),
          "conexao='" +
            central.id +
            "' && destino_telefone='" +
            tel.replace(/'/g, '') +
            "' && motivo='aviso_cliente'",
          '-created',
          3,
          0,
        )
        if (envs.length > 0) aviso = String(envs[0].get('texto') || '')
      } catch (eE) {}

      if (aviso === '') {
        if (out.sem_aviso.length < 40)
          out.sem_aviso.push({
            conversa: cv.id.slice(0, 10),
            tel: tel.slice(-6),
            dono: donoNome,
            ultima: String(cv.get('ultima_mensagem_em') || '').slice(0, 16),
          })
        continue
      }

      // quem foi prometido ao cliente?
      var prometido = ''
      try {
        const m = aviso.match(/Quem vai te atender é \*([^*]+)\*/)
        if (m) prometido = m[1].trim()
      } catch (eM) {}

      if (prometido !== '' && donoNome !== '' && prometido !== donoNome) {
        out.divergentes.push({
          conversa: cv.id.slice(0, 10),
          lead: leadId.slice(0, 10),
          nome: String(lead.get('nome') || '').slice(0, 22),
          tel: tel.slice(-6),
          prometido_ao_cliente: prometido,
          dono_real: donoNome,
          etapa: String(cv.get('etapa_atual') || ''),
          ultima: String(cv.get('ultima_mensagem_em') || '').slice(0, 16),
        })
      }
    }

    out.resumo = {
      transferidas: out.total_transferidas,
      divergentes: out.divergentes.length,
      sem_aviso: out.sem_aviso.length,
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
