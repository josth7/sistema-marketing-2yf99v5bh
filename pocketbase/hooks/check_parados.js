/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO — leads parados no celular do atendimento (17/11).
 *
 * O sintoma que o dono relatou: o cliente recebeu a mensagem dizendo que o
 * vendedor ia atender, mas o lead NÃO aparece no CRM do vendedor.
 *
 * Aqui se separa o problema em três perguntas:
 *   1. quantas conversas foram TRANSFERIDAS (cliente avisado) e o lead ficou
 *      SEM dono?
 *   2. quantas têm dono, mas o dono NÃO é um vendedor válido (usuário de teste,
 *      usuário suspenso, dono apagado)?
 *   3. quantas têm dono válido e mesmo assim o vendedor não vê (conversa sem
 *      `lead` vinculado)?
 *
 * Só leitura — não altera nada.
 *
 * GET /backend/v1/check/leads-parados
 */
routerAdd(
  'GET',
  '/backend/v1/check/leads-parados',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = {
      ok: true,
      agora: new Date().toISOString().slice(0, 19),
      total_conversas: 0,
      a: [],
      b: [],
      c: [],
      d: 0,
      vendedores: [],
    }

    // ---------- vendedores válidos (conexão de vendedor + usuário existente) ----------
    const vendPorUser = {}
    const vendPorNumero = {}
    try {
      const cxs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='vendedor' && ativo=true && fixture=false",
        '',
        30,
        0,
      )
      for (const c of cxs) {
        const uid = String(c.get('vendedor_user') || '')
        const nome = String(c.get('nome_exibicao') || '')
        const num = String(c.get('numero') || '').replace(/[^0-9]/g, '')
        if (uid !== '') vendPorUser[uid] = nome
        if (num !== '') vendPorNumero[num] = nome
        out.vendedores.push({ nome: nome, user: uid.slice(0, 8), numero: num.slice(-6) })
      }
    } catch (e0) {}

    // ---------- todas as conversas da central ----------
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
    if (!central) return e.json(200, { ok: false, erro: 'sem conexao central' })

    var cvs = []
    try {
      cvs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "conexao='" + central.id + "' && fixture=false",
        '',
        3000,
        0,
      )
    } catch (e2) {}
    out.total_conversas = cvs.length

    for (const cv of cvs) {
      const estado = String(cv.get('estado') || '')
      const leadId = String(cv.get('lead') || '')
      const tel = String(cv.get('contato_telefone') || '')
      const etapa = String(cv.get('etapa_atual') || '')
      const ultima = String(cv.get('ultima_mensagem_em') || cv.get('created') || '').slice(0, 19)

      // só interessa conversa que o robô já passou adiante (transferida) ou que
      // tem um lead
      const transferida = estado === 'transferida'
      if (leadId === '') {
        // conversa sem lead: se já foi transferida, é cliente avisado sem CRM
        if (transferida) {
          if (out.c.length < 60)
            out.c.push({
              conversa: cv.id.slice(0, 10),
              tel: tel.slice(-6),
              estado: estado,
              etapa: etapa,
              ultima: ultima,
            })
        }
        continue
      }

      var lead = null
      try {
        lead = app.findRecordById('crm_leads', leadId)
      } catch (eL) {}
      if (!lead) {
        if (transferida) {
          if (out.b.length < 60)
            out.b.push({
              conversa: cv.id.slice(0, 10),
              tel: tel.slice(-6),
              motivo: 'lead nao existe mais',
            })
        }
        continue
      }

      const ow = String(lead.get('owner_id') || '')
      const nomeLead = String(lead.get('nome') || '').slice(0, 24)
      const statusLead = String(lead.get('status') || '')

      if (ow === '') {
        // transferida com cliente avisado e SEM dono = o caso do dono
        if (transferida) {
          if (out.a.length < 80)
            out.a.push({
              conversa: cv.id.slice(0, 10),
              lead: leadId.slice(0, 10),
              nome: nomeLead,
              tel: tel.slice(-6),
              etapa: etapa,
              status: statusLead,
              ultima: ultima,
            })
        }
        continue
      }

      // dono existe, mas é vendedor válido?
      if (vendPorUser[ow] === undefined) {
        var donoNome = ''
        var donoEmail = ''
        try {
          const u = app.findRecordById('users', ow)
          donoNome = String(u.get('name') || '')
          donoEmail = String(u.get('email') || '')
        } catch (eU) {
          donoNome = '(usuario apagado)'
        }
        if (out.b.length < 60)
          out.b.push({
            conversa: cv.id.slice(0, 10),
            lead: leadId.slice(0, 10),
            nome: nomeLead,
            tel: tel.slice(-6),
            dono: donoNome,
            email: donoEmail,
            estado: estado,
            etapa: etapa,
            ultima: ultima,
          })
        continue
      }

      out.d++
    }

    out.resumo = {
      transferidas_sem_dono: out.a.length,
      dono_invalido: out.b.length,
      conversa_sem_lead: out.c.length,
      conferidas_ok: out.d,
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
