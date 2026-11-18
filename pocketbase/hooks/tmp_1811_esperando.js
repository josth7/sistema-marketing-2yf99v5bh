/// <reference path="../pb_data/types.d.ts" />
/**
 * TEMPORÁRIO (18/11) — disparo único do "Avisar vendedores" da tela
 * Conversas esperando, a pedido do Rodrigo (consultor), sem login de tela.
 * Mesma regra da rota POST /backend/v1/gestao/esperando/avisar
 * (wa_avisos_vendedor.js): só clientes com dono e vendedor com número ativo;
 * janela aberta → pendente; fechada → guardado até o "bom dia"
 * (wa_avisos_retidos solta). Dedupe por lead e dia: não duplica.
 * Roda uma vez (flag no store) só em 18/11. APAGAR depois.
 */
cronAdd('tmp_1811_esperando', '* * * * *', () => {
  const FLAG = 'tmp_1811_esperando_feito'
  if ($app.store().get(FLAG)) return
  const agora = new Date().getTime()
  const hojeUTC = new Date(agora).toISOString().slice(0, 10)
  if (hojeUTC !== '2026-11-18') return
  $app.store().set(FLAG, true)

  function dig(v) {
    return String(v || '').replace(/\D/g, '')
  }
  function chaveCli(t) {
    var d = dig(t)
    if (d.indexOf('55') === 0 && d.length > 11) d = d.slice(2)
    if (d.length === 11 && d.charAt(2) === '9') d = d.slice(0, 2) + d.slice(3)
    return d
  }
  try {
    const desde24 = new Date(agora - 24 * 3600000).toISOString().replace('T', ' ').slice(0, 19)
    const hojeBR = new Date(agora - 3 * 3600000).toISOString().slice(0, 10)

    var empresaG = ''
    try {
      const eh = $app.findRecordsByFilter('empresas', "cnpj='01.289.282/0001-51'", '', 1, 0)
      if (eh.length > 0) empresaG = eh[0].id
    } catch (eE) {}

    var central = null
    const cs = $app.findRecordsByFilter(
      'whatsapp_conexoes',
      "papel='central' && ativo=true && fixture=false",
      '',
      5,
      0,
    )
    if (cs.length > 0) central = cs[0]
    if (!central) {
      console.log('tmp_1811_esperando: central não encontrada')
      return
    }
    const modeloAv = String(central.get('modelo_aviso_vendedor') || '')

    const vend = {}
    for (const c of $app.findRecordsByFilter(
      'whatsapp_conexoes',
      "papel='vendedor' && ativo=true && fixture=false",
      '',
      50,
      0,
    )) {
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
    const janelas = []
    for (const u in vend)
      janelas.push(vend[u].prim + '=' + (vend[u].janela ? 'bom_dia_ok' : 'sem_bom_dia'))
    console.log('tmp_1811_esperando: janelas ' + janelas.join(' '))

    const leadInfo = {}
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

    const porCli = {}
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
    const out = { total: 0, sem_dono: 0, por_vendedor: {} }
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
      if (!out.por_vendedor[v.prim])
        out.por_vendedor[v.prim] = { total: 0, agora: 0, aguardando_bom_dia: 0, ja_avisado_hoje: 0 }
      const pv = out.por_vendedor[v.prim]
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
        env.set('modo', 'texto')
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
        }
        env.set('estado', v.janela || modeloAv !== '' ? 'pendente' : 'fora_da_janela_sem_modelo')
        env.set('tentativas', 0)
        env.set('dedupe_key', chave)
        env.set('fixture', false)
        if (empresaG !== '') env.set('empresa', empresaG)
        $app.save(env)
      } catch (eEnv) {
        console.log('tmp_1811_esperando: falhou lead ' + lead + ' -> ' + String(eEnv).slice(0, 120))
      }
    }
    console.log(
      'tmp_1811_esperando: ' +
        out.total +
        ' cliente(s) com dono, ' +
        out.sem_dono +
        ' sem dono | ' +
        JSON.stringify(out.por_vendedor),
    )
  } catch (eTop) {
    console.log('tmp_1811_esperando: erro ' + String(eTop).slice(0, 200))
  }
})
