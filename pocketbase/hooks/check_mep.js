/// <reference path="../pb_data/types.d.ts" />
/**
 * ITEM 6 — META POR EMPRESA: prova e configuração (17/11).
 *
 * O que faz:
 *   1. marca na GOO7 os NOMES dos segredos dela (META_TOKEN_GOO7 / META_CONTA_GOO7);
 *   2. confirma que a Haisan aponta para os nomes fixos antigos;
 *   3. PROVA que a resolução por empresa devolve coisas diferentes para cada
 *      uma — lendo o nome que cada empresa guarda, não o valor do segredo.
 *
 * Sem `?executar=1` é só leitura.
 *
 * GET /backend/v1/check/meta-empresa-prova?executar=1
 */
routerAdd(
  'GET',
  '/backend/v1/check/meta-empresa-prova',
  (e) => {
    if (!e.auth) return e.json(401, { ok: false })

    const app = $app
    const executar = String(e.request.url.query().get('executar') || '') === '1'
    const out = { ok: true, executar: executar, antes: [], depois: [], passos: [], green: false }

    // ---------- estado atual ----------
    var empresas = []
    try {
      empresas = app.findRecordsByFilter('empresas', 'ativa=true', '', 20, 0)
    } catch (e0) {}

    for (const emp of empresas) {
      out.antes.push({
        apelido: String(emp.get('apelido') || emp.get('nome') || ''),
        token_segredo: String(emp.get('meta_token_segredo') || '(vazio)'),
        conta_segredo: String(emp.get('meta_conta_segredo') || '(vazio)'),
      })
    }

    // ---------- configura a GOO7 ----------
    if (executar) {
      for (const emp of empresas) {
        const ap = String(emp.get('apelido') || '')
        // o dono chamou de "Gol 7"; no sistema o apelido agora é GOO7
        if (ap !== 'GOO7' && ap !== 'Gol 7') continue
        try {
          emp.set('meta_token_segredo', 'META_TOKEN_GOO7')
          emp.set('meta_conta_segredo', 'META_CONTA_GOO7')
          app.save(emp)
        } catch (e1) {
          out.erro_goo7 = String(e1).slice(0, 120)
        }
      }
      // relê
      out.depois = []
      try {
        for (const emp of app.findRecordsByFilter('empresas', 'ativa=true', '', 20, 0)) {
          out.depois.push({
            apelido: String(emp.get('apelido') || emp.get('nome') || ''),
            token_segredo: String(emp.get('meta_token_segredo') || '(vazio)'),
            conta_segredo: String(emp.get('meta_conta_segredo') || '(vazio)'),
          })
        }
      } catch (e2) {}
    }

    // ---------- PROVA: cada empresa resolve o SEU nome ----------
    const lista = executar ? out.depois : out.antes
    var haisanToken = ''
    var goo7Token = ''
    for (const it of lista) {
      if (it.apelido === 'Haisan') haisanToken = it.token_segredo
      if (it.apelido === 'GOO7') goo7Token = it.token_segredo
    }

    out.passos.push({
      passo: '1. a Haisan aponta para o nome fixo antigo (META_ACCESS_TOKEN)',
      ok: haisanToken === 'META_ACCESS_TOKEN',
      detalhe: haisanToken,
    })
    out.passos.push({
      passo: '2. a GOO7 aponta para um nome PROPRIO (META_TOKEN_GOO7)',
      ok: goo7Token === 'META_TOKEN_GOO7',
      detalhe: goo7Token,
    })
    out.passos.push({
      passo: '3. as duas usam nomes DIFERENTES (nao se sobrescrevem)',
      ok: haisanToken !== '' && goo7Token !== '' && haisanToken !== goo7Token,
      detalhe: haisanToken + ' != ' + goo7Token,
    })

    // 4. os segredos da GOO7 existem de fato no cofre?
    var temTokenGoo7 = false
    var temContaGoo7 = false
    try {
      temTokenGoo7 = String($secrets.get('META_TOKEN_GOO7') || '') !== ''
    } catch (e3) {}
    try {
      temContaGoo7 = String($secrets.get('META_CONTA_GOO7') || '') !== ''
    } catch (e4) {}
    out.passos.push({
      passo:
        '4. os segredos META_TOKEN_GOO7 / META_CONTA_GOO7 ainda NAO existem (esperado: falta cadastrar)',
      ok: !temTokenGoo7 && !temContaGoo7,
      detalhe: 'token=' + temTokenGoo7 + ' conta=' + temContaGoo7,
    })
    out.segredos_goo7_existem = { token: temTokenGoo7, conta: temContaGoo7 }

    // 5. a Haisan continua resolvendo pelo nome fixo (não quebra)
    var haisanOk = false
    try {
      haisanOk = String($secrets.get('META_ACCESS_TOKEN') || '') !== ''
    } catch (e5) {}
    out.passos.push({
      passo: '5. a Haisan continua funcionando (META_ACCESS_TOKEN existe)',
      ok: haisanOk,
    })

    out.green = out.passos.every(function (p) {
      return p.ok === true
    })
    return e.json(200, out)
  },
  $apis.requireAuth(),
)
