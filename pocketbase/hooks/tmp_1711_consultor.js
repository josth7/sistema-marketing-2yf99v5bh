/// <reference path="../pb_data/types.d.ts" />
/**
 * TEMPORÁRIO (17/11, consultor Adapta) — apagar depois de rodar.
 *
 * Teste pedido pelo consultor: de CADA número conectado (central + vendedores)
 * mandar UMA mensagem para o número de teste dele (final 7791) e ver qual
 * chega:
 *   - central: TEXTO (o consultor falou com a central hoje: janela aberta);
 *   - vendedor com `haisan_apresentacao_vendedor`: o MODELO;
 *   - vendedor sem o modelo: TEXTO.
 * Os envios entram na fila com motivo `teste_consultor` (a fila manda no
 * próximo minuto par; a recusa da Meta volta pelo webhook e marca o envio).
 * 1ª rodada (a partir de 20:43 UTC) cria os envios; 2ª rodada, 5 min depois,
 * lê o resultado de cada um. Fora de 20:43–21:10 UTC não faz nada.
 */
cronAdd('tmp_1711_consultor', '* * * * *', () => {
  const agora = new Date().getTime()
  const ini = new Date('2026-11-17T20:43:00Z').getTime()
  const fim = new Date('2026-11-17T21:10:00Z').getTime()
  if (agora < ini || agora > fim) return
  const P = 'tmp1711i: '
  const DESTINO = '5511936207791'

  var criados = null
  try {
    criados = $app.store().get('tmp1711_v9_ids') || null
  } catch (eSt) {}

  // ---------- 2ª rodada: lê o resultado ----------
  if (criados) {
    var quando = 0
    try {
      quando = Number($app.store().get('tmp1711_v9_em') || 0)
    } catch (eQ) {}
    if (agora - quando < 5 * 60000) return
    try {
      if ($app.store().get('tmp1711_v9_lido') === true) return
      $app.store().set('tmp1711_v9_lido', true)
    } catch (eL) {}
    const ids = String(criados).split(',')
    for (const par of ids) {
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
            String(en.get('ultimo_erro') || '')
              .replace(/[0-9]{10,}/g, '***')
              .slice(0, 120),
        )
      } catch (eR) {
        console.log(P + 'RESULTADO ' + p[0] + ' | envio nao achado')
      }
    }
    return
  }

  // ---------- 1ª rodada: cria um envio por número ----------
  try {
    if ($app.store().get('tmp1711_v9') === true) return
    $app.store().set('tmp1711_v9', true)
  } catch (eS2) {
    if (new Date().getUTCMinutes() % 10 !== 3) return
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
    const modelo = String(c.get('modelo_apresentacao_vendedor') || '')
    // a Elisângela não tem o modelo na conta (lista da D-API, 20:06): vai texto
    const semModelo = nome.toLowerCase().indexOf('elisangela') >= 0
    const usaModelo = papel === 'vendedor' && modelo !== '' && !semModelo
    var nomeV = String(c.get('vendedor_nome_publico') || '').trim()
    if (nomeV === '') nomeV = nome.split(' ')[0]
    try {
      const env = new Record(colEnv)
      env.set('conexao', String(c.id))
      env.set('destino_telefone', DESTINO)
      env.set('motivo', 'teste_consultor')
      env.set('tentativas', 0)
      env.set('fixture', false)
      env.set('dedupe_key', 'teste_consultor|' + c.id + '|' + String(agora))
      env.set('criado_por', '')
      if (usaModelo) {
        env.set('modo', 'modelo')
        env.set('modelo_nome', modelo)
        env.set('legenda', primeiro + '|' + nomeV)
        env.set('variaveis', { 1: primeiro, 2: nomeV })
        env.set('texto', 'TESTE do consultor 17/11: modelo ' + modelo + ' pelo número de ' + nome)
      } else {
        env.set('modo', 'texto')
        env.set(
          'texto',
          'Teste de envio pelo número ' + nome + ' (sistema Haisan, 17/11). Pode ignorar.',
        )
      }
      env.set('estado', 'pendente')
      $app.save(env)
      feitos.push(
        nome.replace(/[=,]/g, ' ') + (usaModelo ? ' [modelo]' : ' [texto]') + '=' + env.id,
      )
    } catch (eE) {
      console.log(P + 'falhou criar envio de ' + nome + ': ' + String(eE).slice(0, 120))
    }
  }
  try {
    $app.store().set('tmp1711_v9_ids', feitos.join(','))
    $app.store().set('tmp1711_v9_em', agora)
  } catch (eS3) {}
  console.log(P + 'envios de teste criados: ' + feitos.join(' ; '))

  // respostas do robô com erro nos últimos 40 min (HTTP 400 visto às 20:40)
  try {
    const desde = new Date(agora - 40 * 60000).toISOString().replace('T', ' ').slice(0, 19)
    const ers = $app.findRecordsByFilter(
      'whatsapp_envios',
      "motivo='ia_resposta' && created>='" +
        desde +
        "' && (estado='erro_definitivo' || estado='erro' || estado='bloqueado_horario')",
      '',
      30,
      0,
    )
    const cont = {}
    for (const e of ers) {
      const k =
        String(e.get('estado')) +
        ' | ' +
        String(e.get('ultimo_erro') || '')
          .replace(/[0-9]{10,}/g, '***')
          .slice(0, 90)
      cont[k] = (cont[k] || 0) + 1
    }
    console.log(P + 'ia_resposta com erro (40 min) = ' + ers.length + ' | ' + JSON.stringify(cont))
  } catch (eIa) {}
})
