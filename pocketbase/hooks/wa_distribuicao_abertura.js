/// <reference path="../pb_data/types.d.ts" />
/**
 * DISTRIBUIÇÃO NA ABERTURA DO DIA — CA-3-66 (SPEC-3-009, 05/11).
 *
 * **O problema que resolve:** cliente que escreve à noite, ou que para no meio
 * do menu, fica em `triagem` sem transferência. Ninguém vê: o robô não responde
 * (fora da janela de 30 min) e não há dono para cobrar. Fica rolando até alguém
 * notar por acaso.
 *
 * **O que faz:** na abertura do expediente (primeiro minuto de cada dia útil),
 * cada conversa da central em `triagem`, cuja última mensagem é do CLIENTE,
 * ganha dono — pelo ponto único de atribuição (`whatsapp_transferencias`), a
 * mesma regra do resto do sistema: carteira → menor carga.
 *
 * **Decisão do dono (05/11):** distribui SOZINHO, sem clique de aprovação.
 *
 * **Aviso ao vendedor:** NÃO nesta versão. O aviso por WhatsApp depende de
 * modelo aprovado pela Meta (e hoje ficaria em `fora_da_janeira_sem_modelo`).
 * O vendedor descobre pelo CRM. A apresentação por modelo fica desligada até a
 * gestão ligar na Administração, como o dono decidiu.
 *
 * **Cuidados (o que NÃO faz):**
 *   - não mexe em conversa que já tem dono;
 *   - não distribui conversa `fixture` (teste nunca vai para vendedor real);
 *   - não distribui conversa cujo lead esteja com dono SUSPENSO — essas vão
 *     para "precisa de ação" (CA-3-69), sem passar pelo rodízio;
 *   - não roda duas vezes no mesmo dia (marca em `whatsapp_eventos`);
 *   - não distribui mensagem de mais de 7 dias: cliente que esperou uma semana
 *     já foi embora; criar dono ali só polui a carteira. Essas ficam listadas.
 *
 * Rotas (leitura/força, para prova e operação):
 *   GET  /backend/v1/atendimento/distribuicao → o que faria agora
 *   POST /backend/v1/atendimento/distribuicao {forcar:true} → roda agora
 *
 * JSVM: helpers INLINE; `$secrets.get`; corpo do $http.send em char-codes.
 */

// ==================== NÚCLEO (inline no cron e nas rotas) ====================
cronAdd('wa_distribuicao_abertura', '1 8 * * 1-5', () => {
  try {
    const app = $app

    // ---------- relógio de Brasília ----------
    const agoraBR = new Date(new Date().getTime() - 3 * 3600 * 1000)
    const hojeBR = agoraBR.toISOString().slice(0, 10)

    // ---------- já rodou hoje? ----------
    const colEv = app.findCollectionByNameOrId('whatsapp_eventos')
    const chaveDia = 'distribuicao_abertura|' + hojeBR
    try {
      const ja = app.findRecordsByFilter(colEv, "dedupe_key='" + chaveDia + "'", '', 1, 0)
      if (ja && ja.length > 0) return
    } catch (eDedupe) {}

    // ---------- conexão central ----------
    var central = null
    try {
      const cxs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true",
        '',
        5,
        0,
      )
      if (cxs && cxs.length > 0) central = cxs[0]
    } catch (eCx) {}
    if (!central) return

    // ---------- conversas em triagem ----------
    var conversas = []
    try {
      conversas = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "conexao='" + central.id + "' && estado='triagem' && fixture=false",
        '',
        2000,
        0,
      )
    } catch (eCv) {
      return
    }

    const colMsg = app.findCollectionByNameOrId('whatsapp_mensagens')
    const colL = app.findCollectionByNameOrId('crm_leads')
    const colU = app.findCollectionByNameOrId('users')
    const colG = app.findCollectionByNameOrId('access_grants')
    const colTr = app.findCollectionByNameOrId('whatsapp_transferencias')

    // ---------- quem está suspenso (tem grant revogado e nenhum ativo) ----------
    const suspensos = {}
    try {
      const todos = app.findRecordsByFilter(colG, '', '', 2000, 0)
      const ativos = {}
      const revogados = {}
      for (const g of todos) {
        const uid = String(g.get('user_id') || '')
        if (uid === '') continue
        if (String(g.get('revoked_at') || '') === '') ativos[uid] = true
        else revogados[uid] = true
      }
      for (const uid in revogados) if (!ativos[uid]) suspensos[uid] = true
    } catch (eSusp) {}

    var pedidos = 0
    var pularSemDono = 0
    var pularAntigo = 0
    var pularSuspenso = 0

    const agoraMs = new Date().getTime()
    const LIMITE_DIAS = 7

    for (const cv of conversas) {
      // última mensagem do contato
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
      } catch (eM) {
        continue
      }
      if (ultimas.length === 0) continue
      ultimas.sort(function (a, b) {
        return String(b.get('enviada_em') || b.get('created') || '').localeCompare(
          String(a.get('enviada_em') || a.get('created') || ''),
        )
      })
      // só faz sentido se o cliente falou por último
      if (String(ultimas[0].get('direcao')) !== 'entrada') continue

      // idade da espera
      const quando = new Date(
        String(ultimas[0].get('enviada_em') || ultimas[0].get('created') || ''),
      ).getTime()
      const dias = quando > 0 ? (agoraMs - quando) / 86400000 : 999
      if (dias > LIMITE_DIAS) {
        pularAntigo++
        continue
      }

      // lead e dono
      const leadId = String(cv.get('lead') || '')
      if (leadId === '') {
        pularSemDono++
        continue
      }
      var lead = null
      try {
        lead = app.findRecordById(colL, leadId)
      } catch (eL) {
        pularSemDono++
        continue
      }
      const dono = String(lead.get('owner_id') || '')
      if (dono !== '') {
        // já tem dono: se o dono está suspenso, fica para "precisa de ação"
        if (suspensos[dono]) pularSuspenso++
        continue
      }

      // ---------- pede a atribuição ao PONTO ÚNICO ----------
      try {
        const tr = new Record(colTr)
        tr.set('lead', lead.id)
        tr.set('origem_pedido', 'ia')
        tr.set('motivo', 'fora_do_roteiro')
        tr.set('simulacao', false)
        tr.set('fixture', false)
        tr.set('detalhe', 'distribuicao da abertura do dia (' + hojeBR + ')')
        app.save(tr)
        pedidos++
      } catch (eTr) {}
    }

    // ---------- marca o dia ----------
    try {
      const ev = new Record(colEv)
      ev.set('dedupe_key', chaveDia)
      ev.set('evento', 'distribuicao_abertura')
      ev.set('session_id', '')
      ev.set('ref_id', central.id)
      ev.set(
        'resultado',
        'pedidos=' +
          pedidos +
          ' | sem_lead=' +
          pularSemDono +
          ' | antigos=' +
          pularAntigo +
          ' | dono_suspenso=' +
          pularSuspenso,
      )
      ev.set('codigo_erro', '')
      ev.set('trace_id', '')
      ev.set('duracao_ms', 0)
      ev.set('recebido_em', new Date().toISOString())
      ev.set('fixture', false)
      app.save(ev)
    } catch (eEv) {}
  } catch (eTop) {}
})

// ==================== LEITURA: o que faria agora ====================
routerAdd(
  'GET',
  '/backend/v1/atendimento/distribuicao',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    function lerL(raw) {
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

    const app = $app
    const out = { ok: true, hoje: '', ja_rodou: false, candidatas: 0, itens: [], por_motivo: {} }

    const agoraBR = new Date(new Date().getTime() - 3 * 3600 * 1000)
    out.hoje = agoraBR.toISOString().slice(0, 10)

    // já rodou hoje?
    try {
      const ja = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_eventos'),
        "dedupe_key='distribuicao_abertura|" + out.hoje + "'",
        '',
        1,
        0,
      )
      out.ja_rodou = ja && ja.length > 0
      if (out.ja_rodou) out.resultado_hoje = String(ja[0].get('resultado') || '')
    } catch (e0) {}

    var central = null
    try {
      const cxs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true",
        '',
        5,
        0,
      )
      if (cxs && cxs.length > 0) central = cxs[0]
    } catch (e1) {}
    if (!central) {
      out.ok = false
      out.erro = 'sem conexão central ativa'
      return e.json(200, out)
    }

    // suspensos
    const suspensos = {}
    try {
      const todos = app.findRecordsByFilter(
        app.findCollectionByNameOrId('access_grants'),
        '',
        '',
        2000,
        0,
      )
      const ativos = {}
      const revogados = {}
      for (const g of todos) {
        const uid = String(g.get('user_id') || '')
        if (uid === '') continue
        if (String(g.get('revoked_at') || '') === '') ativos[uid] = true
        else revogados[uid] = true
      }
      for (const uid in revogados) if (!ativos[uid]) suspensos[uid] = true
    } catch (e2) {}

    var conversas = []
    try {
      conversas = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "conexao='" + central.id + "' && estado='triagem' && fixture=false",
        '',
        2000,
        0,
      )
    } catch (e3) {}

    const colMsg = app.findCollectionByNameOrId('whatsapp_mensagens')
    const colL = app.findCollectionByNameOrId('crm_leads')
    const agoraMs = new Date().getTime()

    for (const cv of conversas) {
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

      const quando = new Date(
        String(ultimas[0].get('enviada_em') || ultimas[0].get('created') || ''),
      ).getTime()
      const horas = quando > 0 ? Math.round((agoraMs - quando) / 3600000) : -1
      const dias = quando > 0 ? (agoraMs - quando) / 86400000 : 999

      var motivo = 'vai_distribuir'
      var dono = ''
      const leadId = String(cv.get('lead') || '')
      if (leadId !== '') {
        try {
          const l = app.findRecordById(colL, leadId)
          dono = String(l.get('owner_id') || '')
        } catch (e5) {}
      }
      if (dono !== '') {
        motivo = suspensos[dono] ? 'dono_suspenso_precisa_de_acao' : 'ja_tem_dono'
      } else if (dias > 7) motivo = 'antiga_demais'
      else if (leadId === '') motivo = 'sem_lead'

      const chave = motivo
      out.por_motivo[chave] = (out.por_motivo[chave] || 0) + 1
      if (motivo === 'vai_distribuir') out.candidatas++

      out.itens.push({
        nome: String(cv.get('contato_nome') || ''),
        telefone: String(cv.get('contato_telefone') || ''),
        espera_horas: horas,
        motivo: motivo,
        dono: dono !== '' ? dono.slice(0, 10) : '',
      })
    }

    out.itens.sort(function (a, b) {
      return b.espera_horas - a.espera_horas
    })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)

// ==================== FORÇAR AGORA (operação e prova) ====================
routerAdd(
  'POST',
  '/backend/v1/atendimento/distribuicao',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    function lerA(raw) {
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

    const hoje = new Date().toISOString().slice(0, 10)
    var pode = false
    try {
      const gs = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('access_grants'),
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        30,
        0,
      )
      for (const g of gs) {
        const ate = String(g.get('valid_until') || '')
        if (ate !== '' && ate.slice(0, 10) < hoje) continue
        const a = lerA(g.get('actions'))
        if (a.indexOf('manage_atendimento') >= 0) pode = true
      }
    } catch (e0) {}
    if (!pode) return e.json(403, { ok: false, erro: 'só a gestão (manage_atendimento)' })

    var body = {}
    try {
      body = e.requestInfo().body || {}
    } catch (eB) {}
    if (body.forcar !== true) {
      return e.json(422, {
        ok: false,
        erro: 'confirmação obrigatória',
        detalhe: 'envie forcar=true para rodar agora (fora do horário programado)',
      })
    }

    // executa a mesma distribuição, ignorando a marca do dia
    const res = { pedidos: 0, sem_lead: 0, antigos: 0, suspensos: 0, erro: '' }
    try {
      const app = $app
      var central = null
      const cxs = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true",
        '',
        5,
        0,
      )
      if (cxs && cxs.length > 0) central = cxs[0]
      if (!central) {
        res.erro = 'sem central'
        return e.json(200, { ok: false, res: res })
      }

      const suspensos = {}
      try {
        const todos = app.findRecordsByFilter(
          app.findCollectionByNameOrId('access_grants'),
          '',
          '',
          2000,
          0,
        )
        const ativos = {}
        const revogados = {}
        for (const g of todos) {
          const uid = String(g.get('user_id') || '')
          if (uid === '') continue
          if (String(g.get('revoked_at') || '') === '') ativos[uid] = true
          else revogados[uid] = true
        }
        for (const uid in revogados) if (!ativos[uid]) suspensos[uid] = true
      } catch (e1) {}

      var conversas = []
      conversas = app.findRecordsByFilter(
        app.findCollectionByNameOrId('whatsapp_conversas'),
        "conexao='" + central.id + "' && estado='triagem' && fixture=false",
        '',
        2000,
        0,
      )
      const colMsg = app.findCollectionByNameOrId('whatsapp_mensagens')
      const colL = app.findCollectionByNameOrId('crm_leads')
      const colTr = app.findCollectionByNameOrId('whatsapp_transferencias')
      const agoraMs = new Date().getTime()

      for (const cv of conversas) {
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
        } catch (e2) {
          continue
        }
        if (ultimas.length === 0) continue
        ultimas.sort(function (a, b) {
          return String(b.get('enviada_em') || b.get('created') || '').localeCompare(
            String(a.get('enviada_em') || a.get('created') || ''),
          )
        })
        if (String(ultimas[0].get('direcao')) !== 'entrada') continue

        const quando = new Date(
          String(ultimas[0].get('enviada_em') || ultimas[0].get('created') || ''),
        ).getTime()
        const dias = quando > 0 ? (agoraMs - quando) / 86400000 : 999
        if (dias > 7) {
          res.antigos++
          continue
        }

        const leadId = String(cv.get('lead') || '')
        if (leadId === '') {
          res.sem_lead++
          continue
        }
        var lead = null
        try {
          lead = app.findRecordById(colL, leadId)
        } catch (e3) {
          res.sem_lead++
          continue
        }
        const dono = String(lead.get('owner_id') || '')
        if (dono !== '') {
          if (suspensos[dono]) res.suspensos++
          continue
        }

        try {
          const tr = new Record(colTr)
          tr.set('lead', lead.id)
          tr.set('origem_pedido', 'ia')
          tr.set('motivo', 'fora_do_roteiro')
          tr.set('simulacao', false)
          tr.set('fixture', false)
          tr.set('detalhe', 'distribuicao forcada pela gestao')
          app.save(tr)
          res.pedidos++
        } catch (e4) {}
      }
    } catch (eTop) {
      res.erro = String(eTop).slice(0, 160)
    }

    return e.json(200, { ok: true, res: res })
  },
  $apis.requireAuth(),
)
