/// <reference path="../pb_data/types.d.ts" />
/**
 * TEMPORÁRIO (17/11, consultor Adapta) — apagar depois de rodar.
 *
 * Teste pedido pelo consultor: mandar o modelo `haisan_apresentacao_vendedor`
 * PELO NÚMERO DA ADRIANA para o número de teste do consultor (final 7791).
 * Não muda o dono do lead. Chave própria (`teste_apres_adriana|...`) para não
 * ocupar a chave `apresentacao|<lead>`.
 * Roda UMA vez entre 20:12 e 20:28 UTC de 17/11/2026. Nenhum telefone no log.
 */
cronAdd('tmp_1711_consultor', '* * * * *', () => {
  const agora = new Date().getTime()
  const ini = new Date('2026-11-17T20:12:00Z').getTime()
  const fim = new Date('2026-11-17T20:28:00Z').getTime()
  if (agora < ini || agora > fim) return
  try {
    if ($app.store().get('tmp1711_v7') === true) return
    $app.store().set('tmp1711_v7', true)
  } catch (eSt) {
    if (new Date().getUTCMinutes() % 10 !== 2) return
  }
  const P = 'tmp1711g: '
  const DESTINO = '5511936207791'

  var adriana = null
  try {
    const us = $app.findRecordsByFilter('users', "email='adriana@haisan.com.br'", '', 1, 0)
    if (us.length > 0) adriana = us[0]
  } catch (eU) {}
  if (!adriana) {
    console.log(P + 'Adriana nao encontrada — nada enviado')
    return
  }
  var cx = null
  try {
    const cs = $app.findRecordsByFilter(
      'whatsapp_conexoes',
      "vendedor_user='" + adriana.id + "' && papel='vendedor' && ativo=true && fixture=false",
      '',
      1,
      0,
    )
    if (cs.length > 0) cx = cs[0]
  } catch (eC) {}
  if (!cx) {
    console.log(P + 'Adriana sem conexao ativa — nada enviado')
    return
  }

  var leadId = ''
  var primeiro = 'tudo bem'
  try {
    const ls = $app.findRecordsByFilter('crm_leads', "telefone~'36207791'", '', 1, 0)
    if (ls.length > 0) {
      leadId = ls[0].id
      const p =
        String(ls[0].get('nome') || '')
          .trim()
          .split(/\s+/)[0] || ''
      if (p !== '' && !/\d/.test(p)) primeiro = p
    }
  } catch (eL) {}

  const modelo =
    String(cx.get('modelo_apresentacao_vendedor') || '') || 'haisan_apresentacao_vendedor'
  var nomeV = String(cx.get('vendedor_nome_publico') || '').trim()
  if (nomeV === '') nomeV = 'Adriana'

  try {
    const env = new Record($app.findCollectionByNameOrId('whatsapp_envios'))
    if (leadId !== '') env.set('lead', leadId)
    env.set('conexao', String(cx.id))
    env.set('destino_telefone', DESTINO)
    env.set('motivo', 'apresentacao_vendedor')
    env.set('modo', 'modelo')
    env.set('modelo_nome', modelo)
    env.set('legenda', primeiro + '|' + nomeV)
    env.set('variaveis', { 1: primeiro, 2: nomeV })
    env.set(
      'texto',
      'TESTE do consultor (17/11): apresentação de ' + nomeV + ' (modelo ' + modelo + ')',
    )
    env.set('estado', 'pendente')
    env.set('tentativas', 0)
    env.set('dedupe_key', 'teste_apres_adriana|' + String(agora))
    env.set('criado_por', '')
    env.set('fixture', false)
    $app.save(env)
    console.log(
      P +
        'teste na fila: envio ' +
        env.id +
        ' | conexao Adriana ' +
        String(cx.get('session_id') || '').slice(0, 14) +
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
})
