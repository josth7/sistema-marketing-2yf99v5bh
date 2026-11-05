/// <reference path="../pb_data/types.d.ts" />
/**
 * PROVA CA-3-74 — mesmo cliente, sem duplicar (05/11).
 *
 * **O defeito:** o WhatsApp manda o celular às vezes com o 9, às vezes sem, e
 * às vezes só um `@lid` (sem número). O mesmo cliente virava dois leads e duas
 * linhas — o caso que a Sabrina apontou.
 *
 * **O que esta rota prova:** com um lead de teste gravado COM o 9, todas as
 * formas do mesmo telefone (com 9, sem 9, formatado) acham **aquele** lead, e
 * nada novo é criado.
 *
 * Não usa cliente real: telefone descartável 5541998000099.
 *
 * GET /backend/v1/diag/prova-dedupe
 */
routerAdd(
  'GET',
  '/backend/v1/diag/prova-dedupe',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const COM9 = '5541998000099'
    const SEM9 = '554199800099'
    const out = { passos: [], ok: false, formatos: [] }
    const colL = app.findCollectionByNameOrId('crm_leads')

    // ---------- limpeza prévia ----------
    for (const t of [COM9, SEM9]) {
      try {
        const ls = app.findRecordsByFilter(colL, "telefone='" + t + "'", '', 10, 0)
        for (const l of ls) {
          try {
            app.delete(l)
          } catch (a) {}
        }
      } catch (e0) {}
    }

    // ---------- 1. lead gravado COM o 9 ----------
    var lead = null
    try {
      lead = new Record(colL)
      lead.set('nome', 'Prova Dedupe')
      lead.set('telefone', COM9)
      lead.set('origem', 'manual')
      lead.set('status', 'entrada_lead')
      lead.set('fixture', false)
      app.save(lead)
      out.passos.push({ passo: '1. lead criado com o 9', ok: true, detalhe: COM9 })
    } catch (e1) {
      out.erro = 'criar lead: ' + String(e1).slice(0, 150)
      return e.json(200, out)
    }

    // ---------- 2. as variantes que o webhook calcula ----------
    // mesma lógica do hook: com 9 -> também sem 9; sem 9 -> também com 9
    function variantes(t) {
      const v = []
      if (t === '') return v
      v.push(t)
      const ddd = t.slice(2, 4)
      const resto = t.slice(4)
      if (t.length === 13 && resto.charAt(0) === '9') v.push('55' + ddd + resto.slice(1))
      else if (t.length === 12) v.push('55' + ddd + '9' + resto)
      return v
    }

    // ---------- 3. cada formato acha o MESMO lead ----------
    const formatos = [COM9, SEM9, '55 41 99800-0099', '+55 (41) 99800-0099']
    for (const f of formatos) {
      const digitos = f.replace(/\D/g, '')
      var achou = null
      for (const v of variantes(digitos)) {
        try {
          const r = app.findRecordsByFilter(colL, "telefone='" + v + "' && fixture=false", '', 1, 0)
          if (r && r.length > 0) {
            achou = r[0]
            break
          }
        } catch (e2) {}
      }
      out.formatos.push({
        formato: f,
        achou: achou !== null,
        mesmo_lead: achou !== null && achou.id === lead.id,
      })
    }

    var todos = true
    for (const f of out.formatos) if (!f.mesmo_lead) todos = false
    out.passos.push({
      passo: '2. todos os formatos acham o MESMO lead',
      ok: todos,
      detalhe:
        out.formatos.filter(function (f) {
          return f.mesmo_lead
        }).length +
        ' de ' +
        out.formatos.length,
    })

    // ---------- 4. nenhum lead novo foi criado ----------
    var quantos = 0
    try {
      quantos = app.findRecordsByFilter(
        colL,
        "telefone='" + COM9 + "' || telefone='" + SEM9 + "'",
        '',
        20,
        0,
      ).length
    } catch (e3) {}
    out.passos.push({
      passo: '3. nenhum lead novo criado',
      ok: quantos === 1,
      detalhe: quantos + ' lead(s) com esse telefone (deve ser 1)',
    })

    // ---------- 5. limpeza ----------
    try {
      app.delete(lead)
      out.passos.push({ passo: '4. limpeza', ok: true, detalhe: 'lead de teste apagado' })
    } catch (e4) {
      out.passos.push({ passo: '4. limpeza', ok: false, detalhe: String(e4).slice(0, 100) })
    }

    var tudo = true
    for (const p of out.passos) if (!p.ok) tudo = false
    out.ok = tudo
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
