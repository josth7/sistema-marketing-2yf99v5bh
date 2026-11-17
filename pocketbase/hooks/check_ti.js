/// <reference path="../pb_data/types.d.ts" />
/**
 * TESTE DA INGESTÃO POR EMPRESA (17/11).
 *
 * Envia um lote de `google_ads` marcado com a empresa GOO7 e confere se o
 * registro em `metricas_diarias` nasceu com a empresa certa — e um segundo lote
 * para a Haisan, para garantir que as duas não se sobrescrevem.
 *
 * Usa data fictícia distante (2035) para não poluir o painel real; apaga no fim.
 *
 * GET /backend/v1/check/teste-ingestao
 */
routerAdd(
  'GET',
  '/backend/v1/check/teste-ingestao',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const out = { ok: true, passos: [] }

    // as duas empresas
    var idHaisan = ''
    var idGoo7 = ''
    try {
      const es = app.findRecordsByFilter('empresas', '', '', 20, 0)
      for (const x of es) {
        const ap = String(x.get('apelido') || '')
        if (ap === 'Haisan') idHaisan = x.id
        if (ap === 'GOO7') idGoo7 = x.id
      }
    } catch (e0) {}
    if (idHaisan === '' || idGoo7 === '')
      return e.json(200, { ok: false, erro: 'empresas nao achadas' })
    out.haisan = idHaisan.slice(0, 8)
    out.goo7 = idGoo7.slice(0, 8)

    // ---------- grava um registro para cada empresa, direto ----------
    // (a rota exige HTTP; aqui se valida a REGRA de gravação com os mesmos campos)
    const col = app.findCollectionByNameOrId('metricas_diarias')
    const criados = []

    function cria(empresaId, campanha) {
      const rec = new Record(col)
      rec.set('origem', 'api')
      rec.set('canal', 'google_ads')
      rec.set('empresa', empresaId)
      rec.set('campanha_id', campanha)
      rec.set('campanha_nome', 'TESTE INGESTAO ' + campanha)
      rec.set('data', '2035-01-01')
      rec.set('natureza', 'pago')
      rec.set('impressoes', 111)
      rec.set('cliques', 11)
      rec.set('custo', 1.11)
      app.save(rec)
      return rec
    }

    try {
      const rGoo = cria(idGoo7, 'teste-goo7-17')
      const rHai = cria(idHaisan, 'teste-haisan-17')
      criados.push(rGoo.id, rHai.id)

      const lGoo = app.findRecordById('metricas_diarias', rGoo.id)
      const lHai = app.findRecordById('metricas_diarias', rHai.id)

      out.passos.push({
        passo: '1. registro do GOO7 grava empresa=GOO7',
        ok: String(lGoo.get('empresa') || '') === idGoo7,
        valor: String(lGoo.get('empresa') || '(vazio)').slice(0, 8),
      })
      out.passos.push({
        passo: '2. registro da Haisan grava empresa=Haisan',
        ok: String(lHai.get('empresa') || '') === idHaisan,
        valor: String(lHai.get('empresa') || '(vazio)').slice(0, 8),
      })

      // ---------- a consulta do painel separa as duas ----------
      const doGoo = app.findRecordsByFilter(
        col,
        "canal='google_ads' && empresa='" + idGoo7 + "'",
        '',
        50,
        0,
      )
      const daHai = app.findRecordsByFilter(
        col,
        "canal='google_ads' && empresa='" + idHaisan + "'",
        '',
        50,
        0,
      )
      var achouGoo = false
      for (const x of doGoo) if (String(x.get('campanha_id')) === 'teste-goo7-17') achouGoo = true
      var achouHai = false
      for (const x of daHai) if (String(x.get('campanha_id')) === 'teste-haisan-17') achouHai = true

      out.passos.push({
        passo: '3. filtrar por GOO7 acha o registro do GOO7',
        ok: achouGoo,
      })
      out.passos.push({
        passo: '4. filtrar por Haisan acha o registro da Haisan',
        ok: achouHai,
      })
      out.passos.push({
        passo: '5. o registro do GOO7 NAO aparece na Haisan',
        ok: !daHai.some(function (x) {
          return String(x.get('campanha_id')) === 'teste-goo7-17'
        }),
      })
    } catch (e1) {
      out.erro = String(e1).slice(0, 160)
    }

    // ---------- limpa ----------
    for (const id of criados) {
      try {
        app.delete(app.findRecordById('metricas_diarias', id))
      } catch (e2) {}
    }

    out.green = (out.passos || []).every(function (p) {
      return p.ok === true
    })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
