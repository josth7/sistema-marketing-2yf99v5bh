/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA CA-3-78 — importar XLSX da Haisan por aba (05/11).
 *
 * Simula o arquivo real: abas Resumo, Adriana, Douglas, Fabio e Elisangela
 * (**sem acento**, como o CA exige), com:
 *   - telefone completo (com DDD) numa aba;
 *   - telefone SEM DDD noutra (deve receber o DDD do vendedor);
 *   - um telefone em DUAS abas (deve virar conflito, sem escolher sozinho);
 *   - uma linha sem telefone (ignorada com motivo);
 *   - reimportação (não pode duplicar).
 *
 * Limpa tudo no fim. Nenhum contato real é tocado.
 *
 * GET /backend/v1/diag/prova-importacao
 */
routerAdd(
  'GET',
  '/backend/v1/diag/prova-importacao',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const LOTE = 'prova-ca378'
    const out = { passos: [], ok: false }
    const colCart = app.findCollectionByNameOrId('carteira_contatos')

    // limpa execução anterior
    try {
      const velhos = app.findRecordsByFilter(colCart, "lote='" + LOTE + "'", '', 500, 0)
      for (const v of velhos) {
        try {
          app.delete(v)
        } catch (a) {}
      }
    } catch (e0) {}

    // linhas como viriam da planilha (aba sem acento, como o CA descreve)
    const linhas = [
      { aba: 'Resumo', nome: 'Total geral', telefone: '5541990000001' },
      { aba: 'Adriana', nome: 'Cliente Adriana Um', telefone: '5541990000011' },
      { aba: 'Adriana', nome: 'Cliente Adriana Dois', telefone: '5541990000012' },
      { aba: 'Douglas', nome: 'Cliente Douglas Sem DDD', telefone: '990000021' },
      { aba: 'Fabio', nome: 'Cliente Fabio Um', telefone: '5541990000031' },
      { aba: 'Elisangela', nome: 'Cliente Elisangela Um', telefone: '5541990000041' },
      // mesmo telefone em duas abas -> conflito
      { aba: 'Fabio', nome: 'Cliente Conflito A', telefone: '5541990000099' },
      { aba: 'Elisangela', nome: 'Cliente Conflito B', telefone: '5541990000099' },
      // sem telefone -> ignorada
      { aba: 'Adriana', nome: 'Sem telefone', telefone: '' },
    ]

    const auth = String(e.request.header.get('Authorization') || '')
    var r1 = null
    try {
      const resp = $http.send({
        url: 'https://sistema-marketing-1f51e.shrd00.internal.goskip.dev/backend/v1/carteira/importar',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ linhas: linhas, lote: LOTE }),
        timeout: 40,
      })
      var cb = resp.body
      if (Array.isArray(cb)) cb = String.fromCharCode.apply(null, cb)
      r1 = JSON.parse(String(cb))
    } catch (e1) {
      out.erro = 'importar: ' + String(e1).slice(0, 150)
      return e.json(200, out)
    }

    out.resultado = r1
    out.passos.push({
      passo: '1. gravou os contatos das abas',
      ok: Number(r1.gravados) >= 5,
      detalhe: 'gravados=' + String(r1.gravados),
    })
    out.passos.push({
      passo: '2. aba Resumo ignorada com motivo',
      ok: Number(r1.resumo_ignorado) === 1,
      detalhe: 'resumo_ignorado=' + String(r1.resumo_ignorado),
    })
    out.passos.push({
      passo: '3. telefone sem DDD recebeu o DDD do vendedor',
      ok: Number(r1.ddd_presumido) === 1,
      detalhe: 'ddd_presumido=' + String(r1.ddd_presumido),
    })
    out.passos.push({
      passo: '4. telefone em duas abas virou conflito',
      ok: Number(r1.conflitos) === 1,
      detalhe: 'conflitos=' + String(r1.conflitos),
    })
    out.passos.push({
      passo: '5. linha sem telefone ignorada',
      ok: Number(r1.sem_telefone) === 1,
      detalhe: 'sem_telefone=' + String(r1.sem_telefone),
    })

    // ---------- vendedor certo por aba (sem acento) ----------
    var porVendedor = {}
    try {
      const gravados = app.findRecordsByFilter(colCart, "lote='" + LOTE + "'", '', 500, 0)
      const nomesU = {}
      for (const u of app.findRecordsByFilter(
        app.findCollectionByNameOrId('users'),
        '',
        '',
        300,
        0,
      )) {
        nomesU[u.id] = String(u.get('name') || u.get('email') || '')
      }
      for (const g of gravados) {
        const n = nomesU[String(g.get('vendedor_user') || '')] || '(sem)'
        porVendedor[n] = (porVendedor[n] || 0) + 1
      }
    } catch (e2) {}
    out.por_vendedor = porVendedor
    const achouFabio = Object.keys(porVendedor).some(function (k) {
      return k.indexOf('bio') >= 0 || k.toLowerCase().indexOf('fabio') >= 0
    })
    const achouElisa = Object.keys(porVendedor).some(function (k) {
      return k.toLowerCase().indexOf('elisangela') >= 0 || k.indexOf('ângela') >= 0
    })
    out.passos.push({
      passo: '6. Fabio e Elisangela reconhecidos sem acento',
      ok: achouFabio && achouElisa,
      detalhe: JSON.stringify(porVendedor),
    })

    // ---------- reimportar não duplica ----------
    var r2 = null
    try {
      const resp2 = $http.send({
        url: 'https://sistema-marketing-1f51e.shrd00.internal.goskip.dev/backend/v1/carteira/importar',
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: auth },
        body: JSON.stringify({ linhas: linhas, lote: LOTE }),
        timeout: 40,
      })
      var c2 = resp2.body
      if (Array.isArray(c2)) c2 = String.fromCharCode.apply(null, c2)
      r2 = JSON.parse(String(c2))
    } catch (e3) {}
    out.reimportacao = r2
    out.passos.push({
      passo: '7. reimportar não duplica',
      ok: r2 !== null && Number(r2.gravados) === 0,
      detalhe: r2
        ? 'gravados=' + String(r2.gravados) + ' repetidos=' + String(r2.repetidos)
        : 'falhou',
    })

    // ---------- limpeza ----------
    try {
      const meus = app.findRecordsByFilter(colCart, "lote='" + LOTE + "'", '', 500, 0)
      var apagados = 0
      for (const m of meus) {
        try {
          app.delete(m)
          apagados++
        } catch (b) {}
      }
      out.passos.push({ passo: '8. limpeza', ok: true, detalhe: apagados + ' removidos' })
    } catch (e4) {
      out.passos.push({ passo: '8. limpeza', ok: false, detalhe: String(e4).slice(0, 100) })
    }

    var tudo = true
    for (const p of out.passos) if (!p.ok) tudo = false
    out.ok = tudo
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
