/// <reference path="../pb_data/types.d.ts" />
/**
 * TEMPORÁRIO (18/11) — a pedido do Rodrigo: manda o aviso ao vendedor dos 9
 * clientes ainda em "esperando" que não tiveram aviso entregue hoje.
 *  - aviso recusado (#131056) ou guardado → volta para a fila;
 *  - sem aviso → cria um, no mesmo texto do "Avisar vendedores".
 * A janela da Meta está aberta (os vendedores deram bom dia hoje). Roda 1x
 * (só até 15:30 UTC de 18/11). APAGAR depois.
 */
cronAdd('tmp_1811_bomdia', '* * * * *', () => {
  const agoraIso = new Date().toISOString()
  if (agoraIso > '2026-11-18T15:30') return
  if ($app.store().get('tmp_9avisos')) return
  $app.store().set('tmp_9avisos', true)
  const ALVO =
    'cxukrpdvnlrxncz,1046x4yobrid05t,axxfiai0kwa1l59,fqd7x0lev2cc8q3,eznzbofmq8b28pz,5gemmu0dmhopjl3,nat7azmmvpoq6np,c2srp2o517h0v74,ro8hp8vheo7dtdo'.split(
      ',',
    )
  function dig(v) {
    return String(v || '').replace(/\D/g, '')
  }
  const agora = new Date().getTime()
  const hojeBR = new Date(agora - 3 * 3600000).toISOString().slice(0, 10)
  var soltos = 0
  var criados = 0
  const falhas = []
  try {
    const cs = $app.findRecordsByFilter(
      'whatsapp_conexoes',
      "papel='central' && ativo=true && fixture=false",
      '',
      1,
      0,
    )
    if (cs.length === 0) {
      console.log('tmp_9avisos: sem central')
      return
    }
    const central = cs[0]
    const colEnv = $app.findCollectionByNameOrId('whatsapp_envios')
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
      vend[u] = {
        prim:
          String(c.get('vendedor_nome_publico') || '').trim() ||
          (nome || '').split(/\s+/)[0] ||
          'vendedor',
        num: num,
      }
    }
    for (const id of ALVO) {
      try {
        const ex = $app.findRecordsByFilter(
          colEnv,
          "lead='" + id + "' && motivo='aviso_vendedor' && created>='2026-11-17 03:00:00'",
          '-created',
          10,
          0,
        )
        var feito = false
        for (const e of ex) {
          const st = String(e.get('estado'))
          if (st === 'enviado' || st === 'pendente') {
            feito = true
            break
          }
        }
        if (!feito && ex.length > 0) {
          const e0 = ex[0]
          e0.set('estado', 'pendente')
          e0.set('tentativas', 0)
          $app.save(e0)
          soltos++
          continue
        }
        if (feito) continue
        // sem aviso: cria
        const lead = $app.findRecordById('crm_leads', id)
        const dono = String(lead.get('owner_id') || '')
        const v = vend[dono]
        if (!v || v.num.length < 12) {
          falhas.push(id + ':sem_vendedor')
          continue
        }
        var dCli = dig(lead.get('telefone'))
        var previa = ''
        var uCli = 0
        try {
          const l8 = dCli.slice(-8)
          const cvs = $app.findRecordsByFilter(
            'whatsapp_conversas',
            "contato_telefone~'" + l8 + "' && fixture=false",
            '',
            10,
            0,
          )
          for (const cv of cvs) {
            const q = new Date(
              String(cv.get('ultima_mensagem_em') || '').replace(' ', 'T'),
            ).getTime()
            if (String(cv.get('ultimo_autor')) === 'cliente' && q > uCli) {
              uCli = q
              previa = String(cv.get('ultima_previa') || '')
              if (dCli === '') dCli = dig(cv.get('contato_telefone'))
            }
          }
        } catch (eCv) {}
        if (dCli !== '' && dCli.indexOf('55') !== 0 && (dCli.length === 10 || dCli.length === 11))
          dCli = '55' + dCli
        const telFmt =
          dCli.length === 13
            ? '(' + dCli.slice(2, 4) + ') ' + dCli.slice(4, 9) + '-' + dCli.slice(9)
            : dCli.length === 12
              ? '(' + dCli.slice(2, 4) + ') ' + dCli.slice(4, 8) + '-' + dCli.slice(8)
              : dCli
        const nomeCli = String(lead.get('nome') || '').trim() || 'Cliente'
        var primCli = nomeCli.split(/\s+/)[0] || ''
        if (/\d/.test(primCli)) primCli = ''
        const horas = uCli > 0 ? Math.max(0, Math.round((agora - uCli) / 3600000)) : 0
        const tempo =
          horas < 1 ? 'menos de 1h' : horas < 24 ? horas + 'h' : Math.round(horas / 24) + ' dia(s)'
        const resumo = String(lead.get('ia_resumo') || '')
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
          (previa !== ''
            ? '\nÚltima mensagem: "' + previa.replace(/\s+/g, ' ').slice(0, 120) + '"'
            : '') +
          (resumo !== '' ? '\nResumo: ' + resumo : '') +
          '\n\nResponder agora: ' +
          link
        const env = new Record(colEnv)
        env.set('lead', id)
        env.set('conexao', String(central.id))
        env.set('destino_telefone', v.num)
        env.set('motivo', 'aviso_vendedor')
        env.set('modo', 'texto')
        env.set('texto', texto.slice(0, 3900))
        env.set('estado', 'pendente')
        env.set('tentativas', 0)
        env.set('dedupe_key', 'aviso_esperando2|' + id + '|' + hojeBR)
        env.set('fixture', false)
        try {
          env.set('empresa', String(central.get('empresa') || ''))
        } catch (eEm) {}
        $app.save(env)
        criados++
      } catch (eL) {
        falhas.push(id + ':' + String(eL).slice(0, 50))
      }
    }
    console.log(
      'tmp_9avisos: soltos=' +
        soltos +
        ' criados=' +
        criados +
        (falhas.length ? ' falhas=' + falhas.join(' ') : ''),
    )
  } catch (e) {
    console.log('tmp_9avisos: erro ' + String(e).slice(0, 150))
  }
})
