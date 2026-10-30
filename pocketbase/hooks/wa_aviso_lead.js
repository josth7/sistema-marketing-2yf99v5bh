/// <reference path="../pb_data/types.d.ts" />
/**
 * AVISO AUTOMÁTICO DE LEAD NOVO (30/10) — cron `wa_aviso_lead_novo`.
 *
 * Por que existe: o agente da agência para amanhã. O aviso ao vendedor que já
 * existia só dispara na TRANSFERÊNCIA manual. Este cobre o caso de o cliente
 * chegar sozinho: todo lead novo (sem dono) recebe vendedor pelo rodízio, e o
 * vendedor recebe aviso com nome e telefone. Nenhum lead fica sem dono.
 *
 * REGRAS:
 *  - pega leads `fixture=false` com `owner_id` VAZIO e criados nas últimas 24h
 *  - escolhe o vendedor de MENOR carga ativa (mesma lógica do rodízio)
 *  - NUNCA escolhe gestão (escopo '*') nem o dono nem fixture
 *  - grava `owner_id` no lead e um evento na trilha
 *  - registra o aviso em `whatsapp_eventos` (dedupe por lead) para não repetir
 *  - NÃO enfileira mensagem de WhatsApp: o envio pela API está bloqueado
 *    (130497). O aviso aparece na tela; quando a Meta liberar, ligar o envio
 *    com uma linha (ENVIAR_WHATSAPP = true).
 *
 * JSVM: tudo INLINE, nada de helper no topo (lição de hoje).
 */

cronAdd('wa_aviso_lead_novo', '*/5 * * * *', () => {
  // quando a Meta liberar o envio, trocar para true
  const ENVIAR_WHATSAPP = false

  try {
    // ---------- vendedores elegíveis ----------
    const colU = $app.findCollectionByNameOrId('users')
    const colG = $app.findCollectionByNameOrId('access_grants')
    var usuarios = []
    try {
      usuarios = $app.findRecordsByFilter(colU, '', 'email', 200, 0)
    } catch (e0) {
      return
    }

    const vendedores = []
    for (const u of usuarios) {
      const email = String(u.get('email') || '')
      const nome = String(u.get('name') || '')
      if (email === '') continue
      if (email.toLowerCase().indexOf('fixture') >= 0) continue
      if (nome.toLowerCase().indexOf('fixture') >= 0) continue
      if (email.indexOf('josth') >= 0) continue

      var ehVendedor = false
      var ehGestao = false
      try {
        const gs = $app.findRecordsByFilter(
          colG,
          "user_id='" + u.id + "' && revoked_at=''",
          '',
          20,
          0,
        )
        for (const g of gs) {
          let a = []
          let sc = []
          try {
            const rawA = g.get('actions')
            a =
              Array.isArray(rawA) && rawA.length > 0 && typeof rawA[0] === 'number'
                ? JSON.parse(String.fromCharCode.apply(null, rawA))
                : typeof rawA === 'string'
                  ? JSON.parse(rawA)
                  : rawA || []
          } catch (eA) {}
          try {
            const rawS = g.get('scope_accounts')
            sc =
              Array.isArray(rawS) && rawS.length > 0 && typeof rawS[0] === 'number'
                ? JSON.parse(String.fromCharCode.apply(null, rawS))
                : typeof rawS === 'string'
                  ? JSON.parse(rawS)
                  : rawS || []
          } catch (eS) {}
          if (Array.isArray(sc) && sc.indexOf('*') >= 0) ehGestao = true
          if (a.indexOf('read_conversas') >= 0 || a.indexOf('read_leads') >= 0) ehVendedor = true
        }
      } catch (eG) {}
      if (!ehVendedor || ehGestao) continue
      vendedores.push({ id: u.id, nome: nome || email, email: email })
    }
    if (vendedores.length === 0) return

    // ---------- carga ativa por vendedor ----------
    const colL = $app.findCollectionByNameOrId('crm_leads')
    var todos = []
    try {
      todos = $app.findRecordsByFilter(colL, 'fixture=false', '', 6000, 0)
    } catch (e1) {
      return
    }
    const carga = {}
    for (const l of todos) {
      const ow = String(l.get('owner_id') || '')
      if (ow === '') continue
      const st = String(l.get('status') || 'entrada_lead')
      if (st === 'venda_realizada' || st === 'finalizado' || st === 'descartado') continue
      carga[ow] = (carga[ow] || 0) + 1
    }

    // ---------- leads sem dono nas últimas 24h ----------
    const agora = new Date().getTime()
    const colEv = $app.findCollectionByNameOrId('whatsapp_eventos')

    var distribuidos = 0
    for (const l of todos) {
      const ow = String(l.get('owner_id') || '')
      if (ow !== '') continue
      const criado = String(l.get('created') || '')
      if (criado === '') continue
      var idade = agora - new Date(criado).getTime()
      if (!(idade >= 0) || idade > 86400000) continue // só as últimas 24h

      // já avisado? (dedupe por lead)
      const chave = 'aviso_lead_novo|' + l.id
      try {
        const ja = $app.findRecordsByFilter(colEv, "dedupe_key='" + chave + "'", '', 1, 0)
        if (ja && ja.length > 0) continue
      } catch (e2) {}

      // escolhe o de menor carga
      var escolhido = null
      var menor = -1
      for (const v of vendedores) {
        const c = carga[v.id] || 0
        if (menor < 0 || c < menor) {
          menor = c
          escolhido = v
        }
      }
      if (!escolhido) continue

      // grava o dono
      try {
        l.set('owner_id', escolhido.id)
        l.set('vendedor_nome', escolhido.nome)
        $app.save(l)
        carga[escolhido.id] = (carga[escolhido.id] || 0) + 1
        distribuidos++
      } catch (e3) {
        continue
      }

      // evento na trilha do lead
      try {
        const colTr = $app.findCollectionByNameOrId('crm_lead_events')
        const ev = new Record(colTr)
        ev.set('lead', l.id)
        ev.set('tipo', 'status')
        ev.set(
          'texto',
          'Distribuído automaticamente para ' + escolhido.nome + ' (menor carga: ' + menor + ')',
        )
        ev.set('user_id', '')
        $app.save(ev)
      } catch (e4) {}

      // registra o aviso (dedupe)
      try {
        const evA = new Record(colEv)
        evA.set('dedupe_key', chave)
        evA.set('evento', 'aviso_lead_novo')
        evA.set('session_id', '')
        evA.set('ref_id', l.id)
        evA.set('resultado', ENVIAR_WHATSAPP ? 'enviado_whatsapp' : 'registrado_sem_envio')
        evA.set('codigo_erro', 'vendedor=' + escolhido.nome)
        evA.set('trace_id', '')
        evA.set('duracao_ms', 0)
        evA.set('recebido_em', new Date().toISOString())
        evA.set('fixture', false)
        $app.save(evA)
      } catch (e5) {}
    }

    if (distribuidos > 0) {
      console.log('wa_aviso_lead_novo: ' + distribuidos + ' lead(s) distribuído(s)')
    }
  } catch (eTop) {}
})

// ==================== consulta: quem está sem dono ====================
routerAdd(
  'GET',
  '/backend/v1/crm/sem-dono',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false, erro: 'autenticação obrigatória' })

    const colL = $app.findCollectionByNameOrId('crm_leads')
    var todos = []
    try {
      todos = $app.findRecordsByFilter(colL, 'fixture=false && owner_id=""', '', 500, 0)
    } catch (e1) {}

    const itens = []
    for (const l of todos) {
      itens.push({
        id: l.id,
        nome: String(l.get('nome') || ''),
        telefone: String(l.get('telefone') || ''),
        origem: String(l.get('origem') || ''),
        status: String(l.get('status') || ''),
        criado: String(l.get('created') || '').slice(0, 19),
      })
    }
    return e.json(200, { ok: true, total: itens.length, itens: itens })
  },
  $apis.requireAuth(),
)
