/// <reference path="../pb_data/types.d.ts" />
/**
 * TEMPORÁRIO (17/11, consultor Adapta) — apagar depois de rodar.
 *
 * Pedido do consultor (17/11, 17h): atribuir à Elisângela o cliente de final
 * 36207791 e FORÇAR a apresentação pelo número dela para esse cliente
 * (modelo aprovado da conexão dela; {{1}} cliente, {{2}} vendedora).
 * Roda UMA vez entre 20:01 e 20:28 UTC de 17/11/2026. Nenhum telefone no log.
 */
cronAdd('tmp_1711_consultor', '* * * * *', () => {
  const agora = new Date().getTime()
  const ini = new Date('2026-11-17T20:01:00Z').getTime()
  const fim = new Date('2026-11-17T20:28:00Z').getTime()
  if (agora < ini || agora > fim) return
  try {
    if ($app.store().get('tmp1711_v5') === true) return
    $app.store().set('tmp1711_v5', true)
  } catch (eSt) {
    if (new Date().getUTCMinutes() % 10 !== 1) return
  }

  const P = 'tmp1711e: '
  const ALVO = '36207791'
  const DESTINO_PADRAO = '5511936207791'
  function dig(v) {
    return String(v || '').replace(/\D/g, '')
  }
  function buscar(col, filtro, limite) {
    try {
      return $app.findRecordsByFilter(col, filtro, '', limite, 0)
    } catch (e1) {
      console.log(P + 'busca falhou em ' + col + ': ' + String(e1).slice(0, 120))
      return []
    }
  }

  // ---------- Elisângela e o número dela ----------
  const us = buscar('users', "email='elisangela@haisan.com.br'", 1)
  if (us.length === 0) {
    console.log(P + 'Elisangela nao encontrada — nada feito')
    return
  }
  const elis = us[0]
  const cxs = buscar(
    'whatsapp_conexoes',
    "vendedor_user='" + elis.id + "' && papel='vendedor' && ativo=true && fixture=false",
    1,
  )
  if (cxs.length === 0) {
    console.log(P + 'Elisangela sem conexao de vendedor ativa — nada feito')
    return
  }
  const cxE = cxs[0]
  const modelo =
    String(cxE.get('modelo_apresentacao_vendedor') || '') || 'haisan_apresentacao_vendedor'
  var nomeV = String(cxE.get('vendedor_nome_publico') || '').trim()
  if (nomeV === '') nomeV = 'Elisangela'

  // ---------- lead do cliente ----------
  var leads = buscar('crm_leads', "telefone~'" + ALVO + "'", 5)
  const convs = buscar('whatsapp_conversas', "contato_telefone~'" + ALVO + "'", 20)
  if (leads.length === 0) {
    for (const cv of convs) {
      const lid = String(cv.get('lead') || '')
      if (lid === '') continue
      try {
        leads.push($app.findRecordById('crm_leads', lid))
      } catch (eL) {}
      if (leads.length > 0) break
    }
  }
  console.log(P + 'leads achados = ' + leads.length + ' | conversas achadas = ' + convs.length)
  for (const cv of convs) {
    console.log(
      P +
        'conversa ' +
        cv.id +
        ' | conexao=' +
        cv.get('conexao') +
        ' | estado=' +
        cv.get('estado') +
        ' | ultimo_autor=' +
        cv.get('ultimo_autor') +
        ' | ultima=' +
        String(cv.get('ultima_mensagem_em')).slice(0, 19) +
        ' | lead=' +
        cv.get('lead'),
    )
  }
  if (leads.length === 0) {
    console.log(P + 'nenhum lead para este numero — nada atribuido nem enviado')
    return
  }

  const lead = leads[0]
  const donoAntes = String(lead.get('owner_id') || '')
  var nomeAntes = '(sem dono)'
  if (donoAntes !== '') {
    try {
      nomeAntes = String($app.findRecordById('users', donoAntes).get('name') || donoAntes)
    } catch (eU) {
      nomeAntes = donoAntes
    }
  }

  // ---------- 1. atribui à Elisângela ----------
  try {
    lead.set('owner_id', elis.id)
    lead.set('vendedor_nome', String(elis.get('name') || 'Elisangela Silva'))
    $app.save(lead)
    const ev = new Record($app.findCollectionByNameOrId('crm_lead_events'))
    ev.set('lead_id', lead.id)
    ev.set('tipo', 'status')
    ev.set(
      'texto',
      'Atribuído à ' +
        String(elis.get('name') || 'Elisangela') +
        ' (pedido do consultor, 17/11). Antes: ' +
        nomeAntes,
    )
    ev.set('user_id', '')
    ev.set('fixture', false)
    $app.save(ev)
    console.log(
      P +
        'lead ' +
        lead.id +
        ' atribuido a Elisangela | antes: ' +
        nomeAntes +
        ' | status=' +
        lead.get('status'),
    )
  } catch (eA) {
    console.log(P + 'FALHOU atribuir: ' + String(eA).slice(0, 160))
    return
  }

  // ---------- 2. apresentação forçada do número dela para o cliente ----------
  var destino = dig(lead.get('telefone'))
  if (destino.indexOf('55') !== 0 && (destino.length === 10 || destino.length === 11))
    destino = '55' + destino
  if (destino.length < 12 || destino.indexOf(ALVO) < 0) destino = DESTINO_PADRAO
  if (destino === dig(cxE.get('numero'))) {
    console.log(P + 'destino igual ao numero da Elisangela — nao enviado')
    return
  }

  const colEnv = $app.findCollectionByNameOrId('whatsapp_envios')
  for (const a of buscar('whatsapp_envios', "dedupe_key='apresentacao|" + lead.id + "'", 5)) {
    try {
      a.set('dedupe_key', 'apres_substituida|' + a.id)
      if (String(a.get('estado')) === 'pendente' || String(a.get('estado')) === 'erro')
        a.set('estado', 'erro_definitivo')
      $app.save(a)
    } catch (eD) {}
  }

  var primeiro =
    String(lead.get('nome') || '')
      .trim()
      .split(/\s+/)[0] || ''
  if (primeiro === '' || /\d/.test(primeiro)) primeiro = 'tudo bem'

  try {
    const env = new Record(colEnv)
    env.set('lead', lead.id)
    env.set('conexao', String(cxE.id))
    env.set('destino_telefone', destino)
    env.set('motivo', 'apresentacao_vendedor')
    env.set('modo', 'modelo')
    env.set('modelo_nome', modelo)
    env.set('legenda', primeiro + '|' + nomeV)
    env.set('variaveis', { 1: primeiro, 2: nomeV })
    env.set(
      'texto',
      'Apresentação de ' +
        nomeV +
        ' (modelo ' +
        modelo +
        '): disparo forçado pelo consultor, 17/11',
    )
    env.set('estado', 'pendente')
    env.set('tentativas', 0)
    env.set('dedupe_key', 'apresentacao|' + lead.id)
    env.set('criado_por', '')
    env.set('fixture', false)
    $app.save(env)
    console.log(
      P +
        'apresentacao na fila: envio ' +
        env.id +
        ' | modelo=' +
        modelo +
        ' | variaveis=' +
        primeiro.length +
        ',' +
        nomeV.length +
        ' chars',
    )
  } catch (eE) {
    console.log(P + 'FALHOU criar envio: ' + String(eE).slice(0, 160))
  }

  // conversa da central passa a "transferida"
  for (const cv of convs) {
    try {
      if (String(cv.get('conexao')) === String(cxE.id)) continue
      cv.set('estado', 'transferida')
      cv.set('transferida_em', new Date().toISOString())
      $app.save(cv)
    } catch (eC) {}
  }
})
