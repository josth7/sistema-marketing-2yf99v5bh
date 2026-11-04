/// <reference path="../pb_data/types.d.ts" />
/**
 * DIAGNÓSTICO TEMPORÁRIO (04/11) — o cron olha TODAS as conversas?
 *
 * O cron busca `findRecordsByFilter(colCv, "conexao=... && estado='triagem'
 * && fixture=false", '', 40, 0)`. O `40` é o LIMITE de registros que o
 * PocketBase devolve, sem ordenação — ou seja, ele olha 40 conversas
 * arbitrárias, não as 40 mais recentes.
 *
 * Com 126 conversas na central, cliente novo pode cair fora da amostra e
 * NUNCA ser atendido. Esta rota prova isso comparando:
 *   - quantas conversas em triagem existem de verdade
 *   - quantas o filtro do cron devolve
 *   - se a conversa de teste (recentíssima) está entre elas
 *
 * GET /backend/v1/diag/amostra-cron
 */
routerAdd(
  'GET',
  '/backend/v1/diag/amostra-cron',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const out = { erro: '' }
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
      out.erro = 'sem central'
      return e.json(200, out)
    }

    const filtro = "conexao='" + central.id + "' && estado='triagem' && fixture=false"
    const colCv = $app.findCollectionByNameOrId('whatsapp_conversas')

    // exatamente como o cron faz
    var amostra = []
    try {
      amostra = $app.findRecordsByFilter(colCv, filtro, '', 40, 0)
    } catch (e1) {
      out.erro = 'filtro: ' + String(e1).slice(0, 180)
    }

    // todas, sem limite
    var todas = []
    try {
      todas = $app.findRecordsByFilter(colCv, filtro, '', 2000, 0)
    } catch (e2) {}

    // total de conversas da central (qualquer estado)
    var todasEstados = []
    try {
      todasEstados = $app.findRecordsByFilter(colCv, "conexao='" + central.id + "'", '', 2000, 0)
    } catch (e3) {}

    out.total_conversas_central = todasEstados.length
    out.em_triagem_de_verdade = todas.length
    out.devolvidas_pelo_filtro_do_cron = amostra.length
    out.olha_todas = amostra.length >= todas.length

    // a conversa de teste entrou na amostra?
    out.teste_na_amostra = false
    out.teste_em_triagem = false
    for (const c of amostra) {
      if (String(c.get('contato_telefone')) === '5541999000077') out.teste_na_amostra = true
    }
    for (const c of todas) {
      if (String(c.get('contato_telefone')) === '5541999000077') out.teste_em_triagem = true
    }

    // lista as 20 primeiras da amostra (as que o cron realmente vê)
    out.amostra = []
    for (const c of amostra.slice(0, 20)) {
      out.amostra.push({
        telefone: String(c.get('contato_telefone') || ''),
        nome: String(c.get('contato_nome') || ''),
        criado: String(c.get('created') || '').slice(0, 19),
      })
    }
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
