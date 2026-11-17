/// <reference path="../pb_data/types.d.ts" />
/**
 * CORRIGE OS 33 LEADS DIVERGENTES (17/11).
 *
 * O que faz, para cada conversa transferida em que o cliente ouviu um vendedor
 * e o lead está com outro:
 *   - mantém o vendedor que o CLIENTE OUVIU como dono do lead;
 *   - registra um evento no histórico do lead dizendo o que foi corrigido
 *     (de quem era, de quem passou a ser, e por quê);
 *   - NÃO envia mensagem ao cliente.
 *
 * Sem `?executar=1` é só leitura (dry run).
 *
 * GET /backend/v1/check/corrige-div?executar=1
 */
routerAdd(
  'GET',
  '/backend/v1/check/corrige-div',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const executar = String(e.request.url.query().get('executar') || '') === '1'
    const out = { ok: true, executar: executar, corrigidos: [], nao_achados: [], erros: [] }

    // vendedor: nome -> user_id (vendedores ativos)
    const userPorNome = {}
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
        const nome = String(c.get('nome_exibicao') || '')
        if (uid !== '' && nome !== '') {
          userPorNome[nome] = uid
          nomePorUser[uid] = nome
        }
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
    if (!central) return e.json(200, { ok: false, erro: 'sem central' })

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

    const colL = app.findCollectionByNameOrId('crm_leads')
    const colEv = app.findCollectionByNameOrId('crm_lead_events')

    for (const cv of cvs) {
      const tel = String(cv.get('contato_telefone') || '')
      const leadId = String(cv.get('lead') || '')
      if (leadId === '') continue

      var lead = null
      try {
        lead = app.findRecordById('crm_leads', leadId)
      } catch (eL) {}
      if (!lead) continue

      const donoAtual = String(lead.get('owner_id') || '')
      const donoNome = nomePorUser[donoAtual] || ''

      // o aviso mais recente ao cliente
      var aviso = ''
      try {
        const envs = app.findRecordsByFilter(
          app.findCollectionByNameOrId('whatsapp_envios'),
          "destino_telefone='" + tel.replace(/'/g, '') + "' && motivo='aviso_cliente'",
          '-created',
          3,
          0,
        )
        if (envs.length > 0) aviso = String(envs[0].get('texto') || '')
      } catch (eE) {}
      if (aviso === '') continue

      var prometido = ''
      try {
        const m = aviso.match(/Quem vai te atender é \*([^*]+)\*/)
        if (m) prometido = m[1].trim()
      } catch (eM) {}
      if (prometido === '') continue

      // normaliza para comparar "Elisangela" com "Elisangela Silva"
      function norm(s) {
        return String(s)
          .toLowerCase()
          .replace(/silva|santos|teles|renato/g, '')
          .replace(/[^a-z]/g, '')
      }
      if (norm(prometido) === norm(donoNome)) continue // já bate

      // acha o user_id do vendedor prometido
      var alvoId = ''
      for (const nome in userPorNome) {
        if (norm(nome) === norm(prometido)) {
          alvoId = userPorNome[nome]
          break
        }
      }
      if (alvoId === '') {
        if (out.nao_achados.length < 40)
          out.nao_achados.push({
            lead: leadId.slice(0, 10),
            nome: String(lead.get('nome') || '').slice(0, 20),
            prometido: prometido,
            motivo: 'vendedor prometido nao encontrado entre os ativos',
          })
        continue
      }

      const registro = {
        lead: leadId.slice(0, 10),
        nome: String(lead.get('nome') || '').slice(0, 20),
        tel: tel.slice(-6),
        de: donoNome || '(sem dono)',
        para: prometido,
      }

      if (!executar) {
        out.corrigidos.push(registro) // dry run: só lista
        continue
      }

      // ---------- corrige ----------
      try {
        lead.set('owner_id', alvoId)
        $app.save(lead)
        // confirma relendo
        const conf = $app.findRecordById('crm_leads', leadId)
        if (String(conf.get('owner_id') || '') !== alvoId) {
          out.erros.push({ lead: leadId.slice(0, 10), erro: 'save nao persistiu' })
          continue
        }

        // histórico do lead
        try {
          const ev = new Record(colEv)
          ev.set('lead_id', leadId)
          ev.set('tipo', 'nota')
          ev.set(
            'texto',
            'Dono corrigido em 17/11: o cliente foi avisado de que seria atendido por ' +
              prometido +
              ', mas o lead estava com ' +
              (donoNome || 'ninguem') +
              '. Mantido o vendedor anunciado ao cliente.',
          )
          $app.save(ev)
        } catch (eEv) {}

        registro.ok = true
        out.corrigidos.push(registro)
      } catch (eSave) {
        out.erros.push({ lead: leadId.slice(0, 10), erro: String(eSave).slice(0, 120) })
      }
    }

    out.total = out.corrigidos.length
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
