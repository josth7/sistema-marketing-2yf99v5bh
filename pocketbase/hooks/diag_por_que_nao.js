/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO TEMPORÁRIO (04/11) — por que o cron ignora a conversa de teste.
 *
 * A sonda provou que os crons rodam (gravou 18:30 e 18:31). A conversa de
 * teste está em triagem, é recente e está na amostra das 40. Mesmo assim o
 * motor não enfileirou nada.
 *
 * Aqui eu simulo, campo por campo, as checagens do cron para a conversa de
 * teste e digo em qual delas ela para — em vez de adivinhar.
 *
 * GET /backend/v1/diag/porque_nao
 */
routerAdd(
  'GET',
  '/backend/v1/diag/porque_nao',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const telefone = String(e.request.url.query().get('telefone') || '5541999000077')
    const out = { telefone: telefone, passos: [], parou_em: '', agora: new Date().toISOString() }

    var central = null
    try {
      const cxs = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_conexoes'),
        "papel='central' && ativo=true",
        '',
        5,
        0,
      )
      if (cxs.length > 0) central = cxs[0]
    } catch (e0) {}
    if (!central) {
      out.parou_em = 'sem central ativa'
      return e.json(200, out)
    }
    out.passos.push({ passo: 'central', ok: true, detalhe: String(central.get('numero') || '') })

    // config
    var cfg = null
    try {
      const vs = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('atendimento_config'),
        '',
        '',
        200,
        0,
      )
      var maior = -1
      for (const v of vs) {
        const n = Number(v.get('versao') || 0)
        if (n > maior) {
          maior = n
          cfg = v
        }
      }
    } catch (e1) {}
    out.passos.push({
      passo: 'painel ligado',
      ok: cfg ? cfg.get('ligado') === true : false,
      detalhe: cfg
        ? 'versao ' + String(cfg.get('versao')) + ' · janela_min ' + String(cfg.get('janela_min'))
        : 'sem config',
    })

    // conversa
    var cv = null
    try {
      const a = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_conversas'),
        "conexao='" + central.id + "' && contato_telefone='" + telefone + "'",
        '',
        1,
        0,
      )
      if (a.length > 0) cv = a[0]
    } catch (e2) {}
    if (!cv) {
      out.parou_em = 'conversa não existe'
      return e.json(200, out)
    }
    out.passos.push({
      passo: 'conversa em triagem',
      ok: String(cv.get('estado')) === 'triagem',
      detalhe: 'estado=' + String(cv.get('estado')) + ' | fixture=' + String(cv.get('fixture')),
    })

    // última mensagem — igual ao cron: ORDEM POR `created`
    var ultimas = []
    try {
      ultimas = $app.findRecordsByFilter(
        $app.findCollectionByNameOrId('whatsapp_mensagens'),
        "conexao='" + central.id + "' && contato_telefone='" + telefone + "'",
        '',
        12,
        0,
      )
    } catch (e3) {}
    out.total_msgs = ultimas.length
    if (ultimas.length === 0) {
      out.parou_em = 'nenhuma mensagem encontrada pelo filtro'
      return e.json(200, out)
    }

    const porCreated = ultimas.slice().sort(function (a, b) {
      return String(b.get('created') || '').localeCompare(String(a.get('created') || ''))
    })
    const porEnviada = ultimas.slice().sort(function (a, b) {
      return String(b.get('enviada_em') || '').localeCompare(String(a.get('enviada_em') || ''))
    })

    out.passos.push({
      passo: 'ultima por created',
      ok: String(porCreated[0].get('direcao')) === 'entrada',
      detalhe:
        'direcao=' +
        String(porCreated[0].get('direcao')) +
        ' | created=' +
        String(porCreated[0].get('created') || '(VAZIO)').slice(0, 19) +
        ' | enviada_em=' +
        String(porCreated[0].get('enviada_em') || '(VAZIO)').slice(0, 19),
    })
    out.passos.push({
      passo: 'ultima por enviada_em',
      ok: String(porEnviada[0].get('direcao')) === 'entrada',
      detalhe:
        'direcao=' +
        String(porEnviada[0].get('direcao')) +
        ' | enviada_em=' +
        String(porEnviada[0].get('enviada_em') || '(VAZIO)').slice(0, 19) +
        ' | created=' +
        String(porEnviada[0].get('created') || '(VAZIO)').slice(0, 19),
    })

    // janela — como o cron calcula (por `created`)
    const janelaMin = cfg ? Number(cfg.get('janela_min') || 0) : 0
    const quandoCron = new Date(String(porCreated[0].get('created') || '')).getTime()
    const minCron = quandoCron > 0 ? Math.round((new Date().getTime() - quandoCron) / 60000) : -1
    const quandoReal = new Date(
      String(porCreated[0].get('enviada_em') || porCreated[0].get('created') || ''),
    ).getTime()
    const minReal = quandoReal > 0 ? Math.round((new Date().getTime() - quandoReal) / 60000) : -1
    out.passos.push({
      passo: 'janela (como o cron calcula)',
      ok: janelaMin === 0 || (minCron >= 0 && minCron <= janelaMin),
      detalhe:
        'idade por created=' +
        minCron +
        ' min | idade real=' +
        minReal +
        ' min | janela=' +
        janelaMin +
        ' min',
    })

    // anti-duplicidade
    const ultimaIa = String(cv.get('ultima_resposta_ia_em') || '')
    const criadaMsg = String(porCreated[0].get('created') || '')
    out.passos.push({
      passo: 'anti-duplicidade',
      ok: !(ultimaIa !== '' && criadaMsg !== '' && ultimaIa >= criadaMsg),
      detalhe: 'ultima_resposta_ia_em=' + (ultimaIa || '(vazio)'),
    })

    for (const p of out.passos) {
      if (!p.ok) {
        out.parou_em = p.passo + ' → ' + p.detalhe
        break
      }
    }
    if (out.parou_em === '') out.parou_em = 'nenhum bloqueio — o cron DEVERIA responder'
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
