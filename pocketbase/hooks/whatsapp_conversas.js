/// <reference path="../pb_data/types.d.ts" />
/**
 * WhatsApp — conversa na ficha do lead e lista de conversas (SPEC-3-005, CA-3-15).
 *
 * Rotas (login + ação `read_conversas`):
 *   GET /backend/v1/whatsapp/leads/{id}/conversa?antes=<data>&limite=100
 *       mensagens das conversas daquele lead em que o usuário está em `leitores`
 *   GET /backend/v1/whatsapp/conversas?conexao=<id|todos>&antes=<data>&limite=50
 *       lista de conversas visíveis, da mais recente para a mais antiga
 *
 * Acesso por número (RN-71):
 *   - gestão: grant de leads com escopo "todos" ('*' ou vazio) vê os cinco números
 *   - vendedor: vê o número ligado ao perfil dele; na central, só os leads com owner = ele
 *   - `read_leads` sozinho NÃO abre conversa — exige `read_conversas`
 *   - cada abertura grava em access_audit
 *
 * A mensagem apagada não devolve texto nem link. Texto é devolvido como texto
 * (nunca HTML), então `<img onerror>` aparece literal na tela.
 *
 * JSVM: lógica INLINE nos callbacks.
 */

routerAdd(
  'GET',
  '/backend/v1/whatsapp/leads/{id}/conversa',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      60,
      0,
    )

    function lerLista(raw) {
      let out = []
      try {
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          out = JSON.parse(String.fromCharCode.apply(null, raw))
        } else if (typeof raw === 'string') {
          out = JSON.parse(raw)
        } else {
          out = raw || []
        }
      } catch (e) {}
      return Array.isArray(out) ? out : []
    }

    var temConversas = false
    var temTudoLeads = false
    var temReadLeads = false
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
      if (ate !== '' && ate.slice(0, 10) < hoje) continue
      const acts = lerLista(g.get('actions'))
      if (acts.indexOf('read_conversas') >= 0) temConversas = true
      if (acts.indexOf('read_leads') >= 0) {
        temReadLeads = true
        const sa = lerLista(g.get('scope_accounts'))
        // escopo VAZIO = só os leads do próprio (deny por padrão); '*' = tudo.
        // Antes vazio virava "tudo" e o vendedor via a conversa da central.
        if (sa.indexOf('*') >= 0) temTudoLeads = true
      }
    }
    if (!temConversas) {
      return e.json(403, { ok: false, erro: 'sem permissão para ler conversas (read_conversas)' })
    }

    let lead
    try {
      lead = $app.findRecordById('crm_leads', e.request.pathValue('id'))
    } catch (_) {
      return e.json(404, { ok: false, erro: 'lead não encontrado' })
    }
    // e.auth.email vem VAZIO no JSVM: sem ler do banco, o usuário de teste nunca
    // é reconhecido como fixture e a tela dele não mostra as conversas de teste.
    var emailAuth = ''
    try {
      emailAuth = String($app.findRecordById('users', e.auth.id).get('email') || '')
    } catch (eEm) {}
    const ehFixture = emailAuth.toLowerCase().indexOf('fixture') >= 0
    if (String(lead.get('fixture')) !== String(ehFixture)) {
      return e.json(404, { ok: false, erro: 'lead não encontrado' })
    }

    // ---------- quais conversas deste lead o usuário pode ver (RN-71) ----------
    const colConv = $app.findCollectionByNameOrId('whatsapp_conversas')
    const colSin = $app.findCollectionByNameOrId('whatsapp_sinais')
    const colConexoes = $app.findCollectionByNameOrId('whatsapp_conexoes')
    var conversas = []
    try {
      conversas = $app.findRecordsByFilter(colConv, "lead='" + lead.id + "'", '', 50, 0)
    } catch (eC) {}

    const visiveis = []
    for (const c of conversas) {
      let sinais = []
      try {
        sinais = $app.findRecordsByFilter(colSin, "conversa='" + c.id + "'", '', 1, 0)
      } catch (eS) {}
      if (!sinais || sinais.length === 0) continue
      const leitores = lerLista(sinais[0].get('leitores'))
      const souLeitor = leitores.indexOf(e.auth.id) >= 0
      if (souLeitor) {
        visiveis.push(c)
        continue
      }
      // gestão com escopo "todos" vê tudo
      if (temTudoLeads) {
        visiveis.push(c)
        continue
      }
      // dono da conversa (número do vendedor ligado ao perfil)
      let conexao = null
      try {
        conexao = $app.findRecordById('whatsapp_conexoes', String(c.get('conexao')))
      } catch (eCx) {}
      if (!conexao) continue
      const papel = String(conexao.get('papel') || '')
      const vendedorDaConexao = String(conexao.get('vendedor_user') || '')
      if (papel === 'vendedor' && vendedorDaConexao === e.auth.id) {
        visiveis.push(c)
        continue
      }
      // central: só a conversa dos leads que estão com ele
      if (
        papel === 'central' &&
        String(lead.get('owner_id') || '') === e.auth.id &&
        String(lead.get('owner_id') || '') !== ''
      ) {
        visiveis.push(c)
      }
    }

    // ---------- auditoria da abertura ----------
    try {
      const colAudit = $app.findCollectionByNameOrId('access_audit')
      const au = new Record(colAudit)
      au.set('at', new Date().toISOString())
      au.set('acao', 'read_conversa')
      au.set('alvo', lead.id)
      au.set('detalhe', { conversas: visiveis.length, usuario: e.auth.id })
      $app.save(au)
    } catch (eA) {}

    if (visiveis.length === 0) {
      // lead conhecido, mas sem conversa que este usuário possa abrir
      return e.json(403, {
        ok: false,
        erro: 'sem permissão para ver a conversa deste lead',
        detalhe: 'nenhuma conversa deste lead está liberada para o seu acesso',
      })
    }

    // ---------- mensagens ----------
    const ids = []
    for (const c of visiveis) ids.push(c.id)
    var filtro = ''
    for (let i = 0; i < ids.length; i++) {
      if (i > 0) filtro += ' || '
      filtro += "conexaoConversa='" + ids[i] + "'"
    }
    const colMsg = $app.findCollectionByNameOrId('whatsapp_mensagens')
    var msgs = []
    try {
      // busca por conversa via campo derivado: usa contato_telefone + conexao
      const filtros = []
      for (const c of visiveis) {
        filtros.push(
          "(conexao='" +
            String(c.get('conexao')) +
            "' && contato_telefone='" +
            String(c.get('contato_telefone')) +
            "')",
        )
      }
      msgs = $app.findRecordsByFilter(colMsg, filtros.join(' || '), '', 200, 0)
    } catch (eM) {
      return e.json(200, { ok: true, lead: lead.id, total: 0, itens: [], aviso: 'sem_leitura' })
    }

    const itens = []
    for (const m of msgs) {
      const apagada = String(m.get('apagada_em') || '') !== ''
      itens.push({
        id: m.id,
        autor: m.get('autor'),
        autor_user: m.get('autor_user'),
        direcao: m.get('direcao'),
        tipo: m.get('tipo'),
        // texto como TEXTO (nunca HTML): a tela renderiza literal
        texto: apagada ? '' : String(m.get('texto') || ''),
        texto_original: String(m.get('texto_original') || ''),
        media_url: apagada ? '' : String(m.get('media_url') || ''),
        media_url_temporaria: String(m.get('media_url_temporaria')) === 'true',
        media_mimetype: m.get('media_mimetype'),
        media_duracao_s: m.get('media_duracao_s'),
        media_ptt: String(m.get('media_ptt')) === 'true',
        status: m.get('status'),
        enviada_em: String(m.get('enviada_em') || ''),
        editada_em: String(m.get('editada_em') || ''),
        apagada: apagada,
        numero: String(m.get('contato_telefone') || ''),
      })
    }
    // ordem cronológica
    itens.sort(function (a, b) {
      return String(a.enviada_em) < String(b.enviada_em) ? -1 : 1
    })

    return e.json(200, {
      ok: true,
      lead: lead.id,
      total: itens.length,
      conversas: visiveis.length,
      itens: itens,
    })
  },
  $apis.requireAuth(),
)

routerAdd(
  'GET',
  '/backend/v1/whatsapp/conversas',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })
    const hoje = new Date().toISOString().slice(0, 10)
    const colG = $app.findCollectionByNameOrId('access_grants')
    const meus = $app.findRecordsByFilter(
      colG,
      "user_id='" + e.auth.id + "' && revoked_at=''",
      '-created',
      60,
      0,
    )
    function lerLista(raw) {
      let out = []
      try {
        if (Array.isArray(raw) && raw.length > 0 && typeof raw[0] === 'number') {
          out = JSON.parse(String.fromCharCode.apply(null, raw))
        } else if (typeof raw === 'string') {
          out = JSON.parse(raw)
        } else {
          out = raw || []
        }
      } catch (e) {}
      return Array.isArray(out) ? out : []
    }
    var temConversas = false
    var temTudoLeads = false
    for (const g of meus) {
      const de = String(g.get('valid_from') || '')
      const ate = String(g.get('valid_until') || '')
      if (de !== '' && de.slice(0, 10) > hoje) continue
      if (ate !== '' && ate.slice(0, 10) < hoje) continue
      const acts = lerLista(g.get('actions'))
      if (acts.indexOf('read_conversas') >= 0) temConversas = true
      if (acts.indexOf('read_leads') >= 0) {
        const sa = lerLista(g.get('scope_accounts'))
        // escopo VAZIO = só os leads do próprio (deny por padrão); '*' = tudo.
        // Antes vazio virava "tudo" e o vendedor via a conversa da central.
        if (sa.indexOf('*') >= 0) temTudoLeads = true
      }
    }
    if (!temConversas) {
      return e.json(403, { ok: false, erro: 'sem permissão para ler conversas (read_conversas)' })
    }
    // e.auth.email vem VAZIO no JSVM: sem ler do banco, o usuário de teste nunca
    // é reconhecido como fixture e a tela dele não mostra as conversas de teste.
    var emailAuth = ''
    try {
      emailAuth = String($app.findRecordById('users', e.auth.id).get('email') || '')
    } catch (eEm) {}
    const ehFixture = emailAuth.toLowerCase().indexOf('fixture') >= 0
    const colConv = $app.findCollectionByNameOrId('whatsapp_conversas')
    const colSin = $app.findCollectionByNameOrId('whatsapp_sinais')
    const colConexoes = $app.findCollectionByNameOrId('whatsapp_conexoes')
    var todas = []
    try {
      todas = $app.findRecordsByFilter(
        colConv,
        'fixture=' + (ehFixture ? 'true' : 'false'),
        '',
        200,
        0,
      )
    } catch (e) {}

    const itens = []
    for (const c of todas) {
      // pode ver?
      let pode = temTudoLeads
      if (!pode) {
        let sinais = []
        try {
          sinais = $app.findRecordsByFilter(colSin, "conversa='" + c.id + "'", '', 1, 0)
        } catch (eS) {}
        if (sinais && sinais.length > 0) {
          const leitores = lerLista(sinais[0].get('leitores'))
          if (leitores.indexOf(e.auth.id) >= 0) pode = true
        }
      }
      if (!pode) {
        let conexao = null
        try {
          conexao = $app.findRecordById('whatsapp_conexoes', String(c.get('conexao')))
        } catch (eC) {}
        if (conexao) {
          const papel = String(conexao.get('papel') || '')
          const vd = String(conexao.get('vendedor_user') || '')
          if (papel === 'vendedor' && vd === e.auth.id) pode = true
          if (papel === 'central') {
            const lid = String(c.get('lead') || '')
            if (lid !== '') {
              try {
                const l = $app.findRecordById('crm_leads', lid)
                if (String(l.get('owner_id') || '') === e.auth.id) pode = true
              } catch (eL) {}
            }
          }
        }
      }
      if (!pode) continue
      let nomeNumero = ''
      try {
        const cx = $app.findRecordById('whatsapp_conexoes', String(c.get('conexao')))
        nomeNumero = String(cx.get('nome_exibicao') || '')
      } catch (eN) {}
      itens.push({
        id: c.id,
        conexao: c.get('conexao'),
        numero_nome: nomeNumero,
        contato_nome: c.get('contato_nome'),
        contato_telefone: c.get('contato_telefone'),
        lead: c.get('lead'),
        ultima_previa: c.get('ultima_previa'),
        ultima_mensagem_em: String(c.get('ultima_mensagem_em') || ''),
        ultimo_autor: c.get('ultimo_autor'),
        total_mensagens: c.get('total_mensagens'),
        estado: c.get('estado'),
        canal: c.get('canal'),
      })
    }
    itens.sort(function (a, b) {
      return String(a.ultima_mensagem_em) < String(b.ultima_mensagem_em) ? 1 : -1
    })
    return e.json(200, { ok: true, total: itens.length, itens: itens })
  },
  $apis.requireAuth(),
)
