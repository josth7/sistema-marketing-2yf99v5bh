/// <reference path="../pb_data/types.d.ts" />
/**
 * TEMPORÁRIO (17/11, consultor Adapta) — apagar depois de rodar.
 *
 * Acompanha as correções de 17/11 (wa_aviso_resposta, whatsapp_transferencias,
 * wa_roteiro_cron). Roda UMA vez entre 19:58 e 20:30 UTC de 17/11/2026:
 *   1. confere, no log, para onde iam as apresentações recusadas;
 *   2. para de tentar as apresentações que iam para o PRÓPRIO número do
 *      vendedor e libera a chave das últimas 2h — assim o wa_apresentacao_15min
 *      manda a apresentação certa ao CLIENTE (dentro da janela dele de 2h);
 *   3. avisos ao vendedor que falharam na CENTRAL FIXTURE nas últimas 2h:
 *      libera a chave para o wa_aviso_resposta (corrigido) avisar de novo pela
 *      central real (com a trava de 1 aviso por cliente a cada 15 min).
 * Nenhum telefone vai para o log.
 */
cronAdd('tmp_1711_consultor', '* * * * *', () => {
  const agora = new Date().getTime()
  const ini = new Date('2026-11-17T19:58:00Z').getTime()
  const fim = new Date('2026-11-17T20:30:00Z').getTime()
  if (agora < ini || agora > fim) return
  try {
    if ($app.store().get('tmp1711_v3') === true) return
    $app.store().set('tmp1711_v3', true)
  } catch (eSt) {
    if (new Date().getUTCMinutes() % 10 !== 0) return
  }

  const P = 'tmp1711c: '
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
  function fmt(ms) {
    return new Date(ms).toISOString().replace('T', ' ').slice(0, 19)
  }
  const duasHoras = fmt(agora - 2 * 3600000)

  const cx = {}
  for (const c of buscar('whatsapp_conexoes', '', 100)) cx[c.id] = c
  for (const id in cx) {
    const c = cx[id]
    if (String(c.get('papel')) === 'central' && String(c.get('fixture')) !== 'true') {
      console.log(
        P +
          'central real ' +
          String(c.get('nome_exibicao') || '') +
          ' | modelo_aviso_vendedor=' +
          String(c.get('modelo_aviso_vendedor') || '(vazio)') +
          ' | modelo_transferencia_cliente=' +
          String(c.get('modelo_transferencia_cliente') || '(vazio)'),
      )
    }
  }

  // ---------- 1 e 2. apresentações ----------
  const ap = buscar(
    'whatsapp_envios',
    "motivo='apresentacao_vendedor' && created>='2026-11-16 03:00:00'",
    2000,
  )
  const grupos = {}
  var parados = 0
  var liberados = 0
  for (const e of ap) {
    const c = cx[String(e.get('conexao') || '')]
    const proprio = c ? dig(e.get('destino_telefone')) === dig(c.get('numero')) : false
    const txt = String(e.get('texto') || '')
    const origem =
      txt.indexOf('Você recebeu um novo lead') === 0
        ? 'transferencia'
        : txt.indexOf('Apresentação de') === 0
          ? 'cron15min'
          : 'outro'
    const k = origem + ' | para o proprio numero=' + proprio + ' | ' + String(e.get('estado'))
    grupos[k] = (grupos[k] || 0) + 1
    if (!proprio) continue
    try {
      var mudou = false
      const est = String(e.get('estado') || '')
      if (est === 'pendente' || est === 'erro') {
        e.set('estado', 'erro_definitivo')
        e.set('ultimo_erro', 'para o proprio numero do vendedor (17/11)')
        mudou = true
        parados++
      }
      if (
        String(e.get('created')) >= duasHoras &&
        String(e.get('dedupe_key') || '').indexOf('apresentacao|') === 0
      ) {
        e.set('dedupe_key', 'apres_proprio_numero|' + e.id)
        mudou = true
        liberados++
      }
      if (mudou) $app.save(e)
    } catch (eS) {
      console.log(P + 'falhou apresentacao ' + e.id + ': ' + String(eS).slice(0, 120))
    }
  }
  console.log(P + 'apresentacoes desde 16/11 = ' + ap.length + ' | ' + JSON.stringify(grupos))
  console.log(
    P +
      'apresentacoes para o proprio numero: paradas=' +
      parados +
      ' | chave liberada (ultimas 2h)=' +
      liberados,
  )

  // ---------- 3. avisos ao vendedor pela central de teste ----------
  var fixCentral = ''
  for (const id in cx) {
    if (String(cx[id].get('papel')) === 'central' && String(cx[id].get('fixture')) === 'true')
      fixCentral = id
  }
  var avParados = 0
  var avLiberados = 0
  if (fixCentral !== '') {
    const av = buscar(
      'whatsapp_envios',
      "motivo='aviso_vendedor' && conexao='" +
        fixCentral +
        "' && fixture=false && created>='2026-11-17 03:00:00'",
      2000,
    )
    for (const e of av) {
      try {
        var m2 = false
        const est2 = String(e.get('estado') || '')
        if (est2 === 'pendente' || est2 === 'erro') {
          e.set('estado', 'erro_definitivo')
          e.set('ultimo_erro', 'saiu pela central de teste (17/11)')
          m2 = true
          avParados++
        }
        if (
          String(e.get('created')) >= duasHoras &&
          String(e.get('dedupe_key') || '').indexOf('aviso_resposta|') === 0
        ) {
          e.set('dedupe_key', 'aviso_fixture_falhou|' + e.id)
          m2 = true
          avLiberados++
        }
        if (m2) $app.save(e)
      } catch (eA) {
        console.log(P + 'falhou aviso ' + e.id + ': ' + String(eA).slice(0, 120))
      }
    }
    console.log(
      P +
        'avisos pela central de teste hoje = ' +
        av.length +
        ' | parados=' +
        avParados +
        ' | chave liberada (ultimas 2h)=' +
        avLiberados,
    )
  }
})
