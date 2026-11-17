/// <reference path="../pb_data/types.d.ts" />
/**
 * AVISO AO VENDEDOR PELA CENTRAL — "ESPERANDO" + LIBERAÇÃO NA JANELA (17/11).
 *
 * Pedido da Anézia na call de 17/11: os clientes da lista "Conversas
 * esperando" (já com dono) têm de chegar no WhatsApp do vendedor. A central
 * manda para o número do vendedor:
 *   ⏳ <vendedor>, cliente esperando resposta há <tempo>
 *   *<cliente>* · (DDD) número
 *   Origem / última mensagem / resumo da IA
 *   Responder agora: wa.me/<cliente>?text=...
 *
 * A JANELA DE 24h DA META: mensagem iniciada pela central só chega ao vendedor
 * se ele falou com a central nas últimas 24h (ou se a central tiver modelo
 * aprovado em `modelo_aviso_vendedor`). Por isso:
 *   - janela aberta → o aviso entra `pendente` (a fila manda em até 2 min);
 *   - janela fechada → o aviso fica GUARDADO (`fora_da_janela_sem_modelo`) e o
 *     cron `wa_avisos_retidos` solta tudo assim que o vendedor mandar o
 *     "bom dia" para a central (combinado com a Sabrina em 17/11).
 *
 * Rotas:
 *   POST /backend/v1/gestao/esperando/avisar  {simular?: true}  (gestão)
 * Cron:
 *   wa_avisos_retidos — a cada 3 min libera os avisos guardados (até 48h).
 */
routerAdd(
  'POST',
  '/backend/v1/gestao/esperando/avisar',
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
    function dig(v) {
      return String(v || '').replace(/\D/g, '')
    }
    function chaveCli(t) {
      var d = dig(t)
      if (d.indexOf('55') === 0 && d.length > 11) d = d.slice(2)
      if (d.length === 11 && d.charAt(2) === '9') d = d.slice(0, 2) + d.slice(3)
      return d
    }

    // ---------- só gestão (escopo '*' ou cargo management) ----------
    var ehGestao = false
    var empresaG = ''
    try {
      const gs = $app.findRecordsByFilter(
        'access_grants',
        "user_id='" + e.auth.id + "' && revoked_at=''",
        '',
        60,
        0,
      )
      for (const g of gs) {
        const sc = lerL(g.get('scope_accounts'))
        if (Array.isArray(sc) && sc.indexOf('*') >= 0) ehGestao = true
        if (String(g.get('role') || '') === 'management') ehGestao = true
        if (empresaG === '') empresaG = String(g.get('empresa') || '')
      }
    } catch (eG) {}
    if (!ehGestao) return e.json(403, { ok: false, erro: 'só a gestão dispara os avisos' })

    const body = e.requestInfo().body || {}
    const simular = body.simular === true
    const agora = new Date().getTime()
    const desde24 = new Date(agora - 24 * 3600000).toISOString().replace('T', ' ').slice(0, 19)
    const hojeBR = new Date(agora - 3 * 3600000).toISOString().slice(0, 10)

    // ---------- central real ----------
    var central = null
    try {
      const cs = $app.findRecordsByFilter(
        'whatsapp_conexoes',
        "papel='central' && ativo=true && fixture=false",
        '',
        5,
        0,
      )
      if (cs.length > 0) central = cs[0]
    } catch (eC) {}
    if (!central) return e.json(422, { ok: false, erro: 'central não encontrada' })
    const modeloAv = String(central.get('modelo_aviso_vendedor') || '')

    // ---------- vendedores com número ativo ----------
    const vend = {}
    try {
      const cxs = $app.findRecordsByFilter(
        'whatsapp_conexoes',
        "papel='vendedor' && ativo=true && fixture=false",
        '',
        50,
        0,
      )
      for (const c of cxs) {
        const u = String(c.get('vendedor_user') || '')
        if (u === '') continue
        var nome = ''
        try {
          nome = String($app.findRecordById('users', u).get('name') || '')
        } catch (eU) {}
        var num = dig(c.get('numero'))
        if (num !== '' && num.indexOf('55') !== 0) num = '55' + num
        var janela = false
        try {
          const mJ = $app.findRecordsByFilter(
            'whatsapp_mensagens',
            "conexao='" +
              central.id +
              "' && direcao='entrada' && contato_telefone~'" +
              num.slice(-8) +
              "' && created>='" +
              desde24 +
              "'",
            '',
            1,
            0,
          )
          janela = !!(mJ && mJ.length > 0)
        } catch (eJ) {}
        vend[u] = {
          nome: nome || String(c.get('nome_exibicao') || ''),
          prim:
            String(c.get('vendedor_nome_publico') || '').trim() ||
            (nome || '').split(/\s+/)[0] ||
            'vendedor',
          num: num,
          janela: janela,
        }
      }
    } catch (eV) {}

    // ---------- leads (dono, nome, origem, resumo) ----------
    const leadInfo = {}
    try {
      for (const l of $app.findRecordsByFilter(
        'crm_leads',
        'fixture=false' + (empresaG !== '' ? " && empresa='" + empresaG + "'" : ''),
        '',
        12000,
        0,
      )) {
        leadInfo[l.id] = {
          dono: String(l.get('owner_id') || ''),
          nome: String(l.get('nome') || ''),
          origem: String(l.get('origem') || ''),
          resumo: String(l.get('ia_resumo') || ''),
        }
      }
    } catch (eL) {}

    // ---------- quem está esperando (mesma regra da tela) ----------
    const porCli = {}
    try {
      for (const cv of $app.findRecordsByFilter(
        'whatsapp_conversas',
        'fixture=false' + (empresaG !== '' ? " && empresa='" + empresaG + "'" : ''),
        '',
        8000,
        0,
      )) {
        if (String(cv.get('interna')) === 'true') continue
        if (String(cv.get('nao_cliente')) === 'true') continue
        const k = chaveCli(cv.get('contato_telefone'))
        if (k === '') continue
        if (!porCli[k]) porCli[k] = []
        porCli[k].push(cv)
      }
    } catch (eCv) {
      return e.json(200, { ok: false, erro: 'não consegui ler as conversas' })
    }

    const rotOrigem = {
      meta: 'anúncio Meta',
      google: 'anúncio Google',
      site: 'site',
      whatsapp: 'WhatsApp',
      organico: 'orgânico',
      carteira: 'carteira',
      manual: 'cadastro manual',
      importacao: 'importação',
    }
    const out = { ok: true, simulacao: simular, total: 0, sem_dono: 0, por_vendedor: {} }
    const colEnv = $app.findCollectionByNameOrId('whatsapp_envios')

    for (const k in porCli) {
      var uCli = 0
      var uNossa = 0
      var cvR = null
      var lead = ''
      var resolv = 0
      for (const cv of porCli[k]) {
        const q = new Date(String(cv.get('ultima_mensagem_em') || '').replace(' ', 'T')).getTime()
        if (q > 0) {
          if (String(cv.get('ultimo_autor') || '') === 'cliente') {
            if (q > uCli) {
              uCli = q
              cvR = cv
            }
          } else if (q > uNossa) uNossa = q
        }
        if (lead === '' && String(cv.get('lead') || '') !== '') lead = String(cv.get('lead'))
        const rq = new Date(String(cv.get('resolvida_em') || '').replace(' ', 'T')).getTime()
        if (rq > resolv) resolv = rq
      }
      if (!(uCli > 0 && uCli > uNossa)) continue
      if (resolv > 0 && uCli <= resolv) continue
      const info = lead !== '' ? leadInfo[lead] : null
      if (!info || info.dono === '' || !vend[info.dono]) {
        out.sem_dono++
        continue
      }
      const v = vend[info.dono]
      if (v.num.length < 12) continue
      out.total++
      if (!out.por_vendedor[v.nome])
        out.por_vendedor[v.nome] = { total: 0, agora: 0, aguardando_bom_dia: 0, ja_avisado_hoje: 0 }
      const pv = out.por_vendedor[v.nome]
      pv.total++

      const chave = 'aviso_esperando|' + lead + '|' + hojeBR
      var ja = false
      try {
        const ex = $app.findRecordsByFilter(colEnv, "dedupe_key='" + chave + "'", '', 1, 0)
        ja = !!(ex && ex.length > 0)
      } catch (eEx) {}
      if (ja) {
        pv.ja_avisado_hoje++
        continue
      }
      if (v.janela || modeloAv !== '') pv.agora++
      else pv.aguardando_bom_dia++
      if (simular) continue

      // ---------- monta o aviso ----------
      var dCli = dig(cvR.get('contato_telefone'))
      if (dCli !== '' && dCli.indexOf('55') !== 0 && (dCli.length === 10 || dCli.length === 11))
        dCli = '55' + dCli
      const telFmt =
        dCli.length === 13
          ? '(' + dCli.slice(2, 4) + ') ' + dCli.slice(4, 9) + '-' + dCli.slice(9)
          : dCli.length === 12
            ? '(' + dCli.slice(2, 4) + ') ' + dCli.slice(4, 8) + '-' + dCli.slice(8)
            : dCli
      const nomeCli = (info.nome || String(cvR.get('contato_nome') || '')).trim() || 'Cliente'
      var primCli = nomeCli.split(/\s+/)[0] || ''
      if (/\d/.test(primCli)) primCli = ''
      const horas = Math.max(0, Math.round((agora - uCli) / 3600000))
      const tempo =
        horas < 1 ? 'menos de 1h' : horas < 24 ? horas + 'h' : Math.round(horas / 24) + ' dia(s)'
      const previa = String(cvR.get('ultima_previa') || '')
        .replace(/\s+/g, ' ')
        .slice(0, 120)
      const resumo = String(info.resumo || '')
        .replace(/\s+/g, ' ')
        .slice(0, 200)
      const msgCli =
        'Oi' +
        (primCli !== '' ? ' ' + primCli : '') +
        '! Aqui é ' +
        v.prim +
        ' da Haisan, tudo bem? Vi sua mensagem e já vou te ajudar.'
      const link = 'https://wa.me/' + dCli + '?text=' + encodeURIComponent(msgCli)
      const texto =
        '⏳ ' +
        v.prim +
        ', cliente esperando resposta há ' +
        tempo +
        '\n*' +
        nomeCli +
        '* · ' +
        telFmt +
        '\nOrigem: ' +
        (rotOrigem[info.origem] || info.origem || 'WhatsApp') +
        (previa !== '' ? '\nÚltima mensagem: "' + previa + '"' : '') +
        (resumo !== '' ? '\nResumo: ' + resumo : '') +
        '\n\nResponder agora: ' +
        link
      try {
        const env = new Record(colEnv)
        env.set('lead', lead)
        env.set('conexao', String(central.id))
        env.set('destino_telefone', v.num)
        env.set('motivo', 'aviso_vendedor')
        env.set('texto', texto.slice(0, 3900))
        if (modeloAv !== '') {
          env.set('modo', 'modelo')
          env.set('modelo_nome', modeloAv)
          env.set(
            'legenda',
            [
              v.prim,
              nomeCli.replace(/\|/g, '/'),
              telFmt,
              (resumo || previa || 'veja a conversa no sistema').replace(/\|/g, '/'),
              link,
            ].join('|'),
          )
        } else {
          env.set('modo', 'texto')
        }
        env.set('estado', v.janela || modeloAv !== '' ? 'pendente' : 'fora_da_janela_sem_modelo')
        env.set('tentativas', 0)
        env.set('dedupe_key', chave)
        env.set('criado_por', e.auth.id)
        env.set('fixture', false)
        $app.save(env)
      } catch (eEnv) {
        console.log(
          'esperando/avisar: falhou envio do lead ' + lead + ' -> ' + String(eEnv).slice(0, 120),
        )
      }
    }

    if (!simular) {
      console.log(
        'esperando/avisar: ' + out.total + ' cliente(s) | ' + JSON.stringify(out.por_vendedor),
      )
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)

// ==================== LIBERA OS AVISOS GUARDADOS ====================
// Aviso ao vendedor que ficou guardado por janela fechada sai assim que o
// vendedor falar com a central (o "bom dia" combinado). Só avisos das
// últimas 48h; no máximo 60 por vendedor por rodada.
cronAdd('wa_avisos_retidos', '*/3 * * * *', () => {
  try {
    const agora = new Date().getTime()
    const desde48 = new Date(agora - 48 * 3600000).toISOString().replace('T', ' ').slice(0, 19)
    const desde24 = new Date(agora - 24 * 3600000).toISOString().replace('T', ' ').slice(0, 19)
    var retidos = []
    try {
      retidos = $app.findRecordsByFilter(
        'whatsapp_envios',
        "motivo='aviso_vendedor' && estado='fora_da_janela_sem_modelo' && fixture=false && created>='" +
          desde48 +
          "'",
        '',
        600,
        0,
      )
    } catch (e1) {
      return
    }
    if (!retidos || retidos.length === 0) return
    const grupos = {}
    for (const r of retidos) {
      const k =
        String(r.get('conexao') || '') +
        '|' +
        String(r.get('destino_telefone') || '').replace(/\D/g, '')
      if (!grupos[k]) grupos[k] = []
      grupos[k].push(r)
    }
    var liberados = 0
    var aguardando = 0
    for (const k in grupos) {
      const p = k.split('|')
      const cx = p[0]
      const dest = p[1] || ''
      if (cx === '' || dest.length < 8) continue
      var aberta = false
      try {
        const ms = $app.findRecordsByFilter(
          'whatsapp_mensagens',
          "conexao='" +
            cx +
            "' && direcao='entrada' && contato_telefone~'" +
            dest.slice(-8) +
            "' && created>='" +
            desde24 +
            "'",
          '',
          1,
          0,
        )
        aberta = !!(ms && ms.length > 0)
      } catch (e2) {}
      if (!aberta) {
        aguardando += grupos[k].length
        continue
      }
      var n = 0
      for (const r of grupos[k]) {
        if (n >= 60) break
        try {
          r.set('estado', 'pendente')
          r.set('tentativas', 0)
          $app.save(r)
          n++
          liberados++
        } catch (e3) {}
      }
    }
    if (liberados > 0) {
      console.log(
        'wa_avisos_retidos: ' +
          liberados +
          ' aviso(s) liberado(s); aguardando bom dia = ' +
          aguardando,
      )
    }
  } catch (eTop) {}
})
