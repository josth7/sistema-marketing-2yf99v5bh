/// <reference path="../pb_data/types.d.ts" />
/**
 * TEMPORÁRIO (17/11, consultor Adapta) — apagar depois de rodar.
 *
 * Teste pedido pelo consultor: mandar para o número de teste dele (final 7791)
 *   - pela CENTRAL: texto (ele falou com a central hoje: janela aberta);
 *   - pelo DOUGLAS: o modelo `haisan_apresentacao_vendedor`.
 * Motivo `teste` (valor aceito pelo campo). A fila manda no minuto par; a
 * recusa da Meta volta pelo webhook e marca o envio. 3 min depois este cron
 * lê o resultado. Só entre 20:47 e 21:15 UTC.
 */
cronAdd('tmp_1711_consultor', '* * * * *', () => {
  const agora = new Date().getTime()
  const ini = new Date('2026-11-17T20:47:00Z').getTime()
  const fim = new Date('2026-11-17T21:15:00Z').getTime()
  if (agora < ini || agora > fim) return
  const P = 'tmp1711j: '
  const DESTINO = '5511936207791'

  var ids = ''
  var em = 0
  try {
    ids = String($app.store().get('tmp1711_v10_ids') || '')
    em = Number($app.store().get('tmp1711_v10_em') || 0)
  } catch (eSt) {}

  if (ids !== '') {
    if (agora - em < 3 * 60000) return
    try {
      if ($app.store().get('tmp1711_v10_lido') === true) return
      $app.store().set('tmp1711_v10_lido', true)
    } catch (eL) {}
    for (const par of ids.split(',')) {
      const p = par.split('=')
      try {
        const en = $app.findRecordById('whatsapp_envios', p[1])
        console.log(
          P +
            'RESULTADO ' +
            p[0] +
            ' | estado=' +
            en.get('estado') +
            ' | tent=' +
            en.get('tentativas') +
            ' | wa_id=' +
            (String(en.get('wa_message_id') || '') !== '' ? 'sim' : 'nao') +
            ' | erro=' +
            String(en.get('ultimo_erro') || '').replace(/[0-9]{10,}/g, '***'),
        )
      } catch (eR) {
        console.log(P + 'RESULTADO ' + p[0] + ' | envio nao achado')
      }
    }
    return
  }

  try {
    if ($app.store().get('tmp1711_v10') === true) return
    $app.store().set('tmp1711_v10', true)
  } catch (eS2) {
    if (new Date().getUTCMinutes() % 10 !== 7) return
  }

  var primeiro = 'tudo bem'
  try {
    const ls = $app.findRecordsByFilter('crm_leads', "telefone~'36207791'", '', 1, 0)
    if (ls.length > 0) {
      const pn =
        String(ls[0].get('nome') || '')
          .trim()
          .split(/\s+/)[0] || ''
      if (pn !== '' && !/\d/.test(pn)) primeiro = pn
    }
  } catch (eLd) {}

  var cxs = []
  try {
    cxs = $app.findRecordsByFilter('whatsapp_conexoes', 'ativo=true && fixture=false', '', 50, 0)
  } catch (eC) {}
  const colEnv = $app.findCollectionByNameOrId('whatsapp_envios')
  const feitos = []
  for (const c of cxs) {
    const papel = String(c.get('papel') || '')
    const nome = String(c.get('nome_exibicao') || '') || papel
    const ehCentral = papel === 'central'
    const ehDouglas = nome.toLowerCase().indexOf('douglas') >= 0
    if (!ehCentral && !ehDouglas) continue
    try {
      const env = new Record(colEnv)
      env.set('conexao', String(c.id))
      env.set('destino_telefone', DESTINO)
      env.set('motivo', 'teste')
      env.set('tentativas', 0)
      env.set('fixture', false)
      env.set('dedupe_key', 'teste_consultor|' + c.id + '|' + String(agora))
      env.set('criado_por', '')
      if (ehDouglas) {
        const modelo =
          String(c.get('modelo_apresentacao_vendedor') || '') || 'haisan_apresentacao_vendedor'
        var nomeV = String(c.get('vendedor_nome_publico') || '').trim() || 'Douglas'
        env.set('modo', 'modelo')
        env.set('modelo_nome', modelo)
        env.set('legenda', primeiro + '|' + nomeV)
        env.set('variaveis', { 1: primeiro, 2: nomeV })
        env.set('texto', 'TESTE do consultor 17/11: modelo ' + modelo + ' pelo número do Douglas')
      } else {
        env.set('modo', 'texto')
        env.set(
          'texto',
          'Teste de envio pela central Atendimento Haisan (sistema, 17/11). Pode ignorar.',
        )
      }
      env.set('estado', 'pendente')
      $app.save(env)
      feitos.push((ehDouglas ? 'Douglas[modelo]' : 'Central[texto]') + '=' + env.id)
    } catch (eE) {
      console.log(P + 'falhou criar envio de ' + nome + ': ' + String(eE).slice(0, 140))
    }
  }
  try {
    $app.store().set('tmp1711_v10_ids', feitos.join(','))
    $app.store().set('tmp1711_v10_em', agora)
  } catch (eS3) {}
  console.log(P + 'envios de teste criados: ' + feitos.join(' ; '))
})
