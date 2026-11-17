/// <reference path="../pb_data/types.d.ts" />
/**
 * TEMPORÁRIO (17/11, consultor Adapta) — apagar depois de rodar.
 *
 * Pedido do consultor em 17/11, durante a call:
 *   1. desvincular a conta rodrigo@adapta de TODOS os clientes
 *      (dono do lead em crm_leads e vendedor na carteira_contatos);
 *   2. procurar o cliente de final 88088067, que ficou sem resposta hoje.
 *
 * Roda só entre 19:42 e 20:20 UTC de 17/11/2026; fora disso não faz nada.
 * O desvínculo é idempotente. Os IDs alterados vão para o log (dá para
 * desfazer). Nenhum telefone vai para o log.
 */
cronAdd('tmp_1711_consultor', '* * * * *', () => {
  const agora = new Date().getTime()
  const ini = new Date('2026-11-17T19:42:00Z').getTime()
  const fim = new Date('2026-11-17T20:20:00Z').getTime()
  if (agora < ini || agora > fim) return

  const P = 'tmp1711: '
  function mask(s) {
    return String(s === undefined || s === null ? '' : s).replace(/[0-9]{8,}/g, '***')
  }
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
  function buscar(col, filtro, ordem, limite) {
    try {
      return $app.findRecordsByFilter(col, filtro, ordem, limite, 0)
    } catch (e1) {
      try {
        return $app.findRecordsByFilter(col, filtro, '', limite, 0)
      } catch (e2) {
        console.log(P + 'busca falhou em ' + col + ': ' + String(e2).slice(0, 120))
        return []
      }
    }
  }

  // diagnóstico só uma vez
  var fazerDiag = true
  try {
    if ($app.store().get('tmp1711_diag') === true) fazerDiag = false
    else $app.store().set('tmp1711_diag', true)
  } catch (eSt) {
    fazerDiag = new Date().getUTCMinutes() % 5 === 0
  }

  const cxNome = {}
  for (const c of buscar('whatsapp_conexoes', '', '', 100)) {
    cxNome[c.id] =
      String(c.get('nome_exibicao') || '') +
      '/' +
      String(c.get('papel') || '') +
      (String(c.get('fixture')) === 'true' ? '/FIXTURE' : '') +
      (c.get('ativo') === true ? '/ativo' : '/inativo')
  }

  // ================= 1. cliente de final 88088067 =================
  if (fazerDiag) {
    console.log(P + 'conexoes = ' + mask(JSON.stringify(cxNome)))
    const alvo = '88088067'

    const ls = buscar('crm_leads', "telefone~'" + alvo + "'", '', 10)
    console.log(P + 'NUMERO: leads achados = ' + ls.length)
    for (const l of ls) {
      var donoEmail = ''
      const ow = String(l.get('owner_id') || '')
      if (ow === '') donoEmail = '(sem dono)'
      else {
        try {
          donoEmail = String($app.findRecordById('users', ow).get('email') || '')
        } catch (eU) {
          donoEmail = '(usuario nao achado ' + ow + ')'
        }
      }
      console.log(
        P +
          'NUMERO lead ' +
          l.id +
          ' | status=' +
          l.get('status') +
          ' | dono=' +
          donoEmail +
          ' | vendedor_nome=' +
          l.get('vendedor_nome') +
          ' | origem=' +
          l.get('origem') +
          ' | criado=' +
          String(l.get('created')).slice(0, 19) +
          ' | empresa=' +
          l.get('empresa'),
      )
      for (const t of buscar('whatsapp_transferencias', "lead='" + l.id + "'", '-created', 10)) {
        console.log(P + 'NUMERO transf ' + mask(JSON.stringify(t)).slice(0, 450))
      }
      for (const pa of buscar('precisa_acao', "lead='" + l.id + "'", '', 10)) {
        console.log(P + 'NUMERO precisa_acao ' + mask(JSON.stringify(pa)).slice(0, 300))
      }
      for (const ev of buscar('crm_lead_events', "lead_id='" + l.id + "'", '-created', 15)) {
        console.log(
          P +
            'NUMERO evento ' +
            String(ev.get('created')).slice(0, 19) +
            ' ' +
            ev.get('tipo') +
            ' ' +
            mask(ev.get('texto')).slice(0, 160),
        )
      }
    }

    const cvs = buscar('whatsapp_conversas', "contato_telefone~'" + alvo + "'", '', 20)
    console.log(P + 'NUMERO: conversas achadas = ' + cvs.length)
    for (const cv of cvs) {
      console.log(
        P +
          'NUMERO conversa ' +
          cv.id +
          ' | num=' +
          (cxNome[String(cv.get('conexao') || '')] || cv.get('conexao')) +
          ' | estado=' +
          cv.get('estado') +
          ' | ultimo_autor=' +
          cv.get('ultimo_autor') +
          ' | ultima=' +
          String(cv.get('ultima_mensagem_em')).slice(0, 19) +
          ' | previa=' +
          mask(cv.get('ultima_previa')).slice(0, 60) +
          ' | pausa=' +
          mask(cv.get('pausada_motivo')).slice(0, 60) +
          ' | transferida=' +
          String(cv.get('transferida_em')).slice(0, 19) +
          ' | ultima_ia=' +
          String(cv.get('ultima_resposta_ia_em')).slice(0, 19) +
          ' | resolvida=' +
          String(cv.get('resolvida_em')).slice(0, 19) +
          ' | interna=' +
          cv.get('interna') +
          ' | nao_cliente=' +
          cv.get('nao_cliente') +
          ' | lead=' +
          cv.get('lead') +
          ' | empresa=' +
          cv.get('empresa') +
          ' | linha=' +
          cv.get('linha'),
      )
    }

    const ms = buscar('whatsapp_mensagens', "contato_telefone~'" + alvo + "'", '-created', 30)
    console.log(P + 'NUMERO: mensagens achadas = ' + ms.length)
    for (const m of ms) {
      console.log(
        P +
          'NUMERO msg ' +
          String(m.get('created')).slice(0, 19) +
          ' | num=' +
          (cxNome[String(m.get('conexao') || '')] || m.get('conexao')) +
          ' | ' +
          m.get('direcao') +
          ' | autor=' +
          m.get('autor') +
          ' | status=' +
          m.get('status') +
          ' | tipo=' +
          m.get('tipo') +
          ' | ' +
          mask(m.get('texto')).slice(0, 70),
      )
    }

    const es = buscar('whatsapp_envios', "destino_telefone~'" + alvo + "'", '-created', 20)
    console.log(P + 'NUMERO: envios achados = ' + es.length)
    for (const en of es) {
      console.log(
        P +
          'NUMERO envio ' +
          String(en.get('created')).slice(0, 19) +
          ' | num=' +
          (cxNome[String(en.get('conexao') || '')] || en.get('conexao')) +
          ' | motivo=' +
          en.get('motivo') +
          ' | modo=' +
          en.get('modo') +
          ' | estado=' +
          en.get('estado') +
          ' | tent=' +
          en.get('tentativas') +
          ' | erro=' +
          mask(en.get('ultimo_erro')).slice(0, 80) +
          ' | ' +
          mask(en.get('texto')).slice(0, 60),
      )
    }
  }

  // ================= 2. desvincular rodrigo@adapta =================
  const us = buscar('users', "email~'rodrigo@adapta'", '', 5)
  if (fazerDiag) console.log(P + 'CONSULTOR: contas rodrigo@adapta = ' + us.length)
  for (const u of us) {
    if (fazerDiag) {
      console.log(P + 'CONSULTOR user ' + u.id + ' | ' + u.get('email') + ' | ' + u.get('name'))
      for (const g of buscar('access_grants', "user_id='" + u.id + "'", '', 20)) {
        console.log(
          P +
            'CONSULTOR grant ' +
            g.id +
            ' | role=' +
            g.get('role') +
            ' | escopo=' +
            JSON.stringify(lerL(g.get('scope_accounts'))) +
            ' | empresa=' +
            g.get('empresa') +
            ' | revogado=' +
            String(g.get('revoked_at') || '') +
            ' | acoes=' +
            JSON.stringify(lerL(g.get('actions'))).slice(0, 300),
        )
      }
      for (const c of buscar('whatsapp_conexoes', "vendedor_user='" + u.id + "'", '', 20)) {
        console.log(P + 'CONSULTOR conexao ' + c.id + ' | ' + (cxNome[c.id] || ''))
      }
      const porNome = buscar(
        'crm_leads',
        "vendedor_nome~'Rodrigo' && owner_id!='" + u.id + "'",
        '',
        2000,
      )
      console.log(P + 'CONSULTOR leads com vendedor_nome Rodrigo e outro dono = ' + porNome.length)
    }

    // leads em que ele é o dono
    const ls = buscar('crm_leads', "owner_id='" + u.id + "'", '', 5000)
    const porStatus = {}
    const porEmpresa = {}
    for (const l of ls) {
      const st = String(l.get('status') || '')
      porStatus[st] = (porStatus[st] || 0) + 1
      const em = String(l.get('empresa') || '')
      porEmpresa[em] = (porEmpresa[em] || 0) + 1
    }
    console.log(
      P +
        'CONSULTOR leads com ele de dono = ' +
        ls.length +
        ' | status=' +
        JSON.stringify(porStatus) +
        ' | empresa=' +
        JSON.stringify(porEmpresa),
    )

    const feitos = []
    for (const l of ls) {
      try {
        l.set('owner_id', '')
        l.set('vendedor_nome', '')
        $app.save(l)
        feitos.push(l.id)
        try {
          const ev = new Record($app.findCollectionByNameOrId('crm_lead_events'))
          ev.set('lead_id', l.id)
          ev.set('tipo', 'nota')
          ev.set('texto', 'Desvinculado da conta do consultor da Adapta (17/11) — lead sem dono')
          ev.set('user_id', '')
          ev.set('fixture', false)
          $app.save(ev)
        } catch (eEv) {}
      } catch (eSv) {
        console.log(P + 'CONSULTOR falhou lead ' + l.id + ': ' + String(eSv).slice(0, 120))
      }
    }
    for (var i = 0; i < feitos.length; i += 40) {
      console.log(P + 'CONSULTOR desvinculados (ids) ' + feitos.slice(i, i + 40).join(','))
    }
    if (ls.length > 0) console.log(P + 'CONSULTOR desvinculados = ' + feitos.length)

    // carteira em que ele é o vendedor
    const cs = buscar('carteira_contatos', "vendedor_user='" + u.id + "'", '', 5000)
    const feitosC = []
    for (const c of cs) {
      try {
        c.set('vendedor_user', '')
        $app.save(c)
        feitosC.push(c.id)
      } catch (eC) {
        console.log(P + 'CONSULTOR falhou carteira ' + c.id + ': ' + String(eC).slice(0, 120))
      }
    }
    for (var j = 0; j < feitosC.length; j += 40) {
      console.log(P + 'CONSULTOR carteira desvinculada (ids) ' + feitosC.slice(j, j + 40).join(','))
    }
    if (fazerDiag || cs.length > 0) {
      console.log(
        P + 'CONSULTOR carteira com ele = ' + cs.length + ' | desvinculada = ' + feitosC.length,
      )
    }
  }
})
