/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0168 — vínculo do usuário com a empresa (CA-3-88, 10/11).
 *
 * **Decisão do consultor (aval 10/11):** `users` fica **global**; o vínculo por
 * empresa fica no grant. Só os donos têm as duas empresas.
 *
 * **O que falta:** o grant não diz **de qual empresa** é. `scope_accounts` é o
 * escopo de carteira (contas de anúncio), não a empresa.
 *
 * Campos:
 *   - `access_grants.empresa` (text) — a empresa do grant;
 *   - `access_grants.empresas` (json) — para o dono, a lista das que tem.
 *
 * Preenche `empresa` com a Haisan em **todos** os grants existentes: hoje só
 * existe a Haisan, então todo mundo é dela. Os donos ganham a lista vazia por
 * enquanto — a Gol 7 entra quando for criada.
 */
migrate(
  (app) => {
    var idHaisan = ''
    try {
      const es = app.findRecordsByFilter('empresas', '', '', 2, 0)
      if (es.length > 0) idHaisan = es[0].id
    } catch (e0) {}
    if (idHaisan === '') {
      console.log('0168: sem empresa — abortando')
      return
    }

    var col = null
    try {
      col = app.findCollectionByNameOrId('access_grants')
    } catch (e1) {
      console.log('0168: access_grants nao encontrada')
      return
    }

    const nomes = []
    try {
      for (const f of col.fields || []) nomes.push(String(f.name))
    } catch (e2) {}

    if (nomes.indexOf('empresa') < 0) {
      try {
        col.fields.add(new TextField({ name: 'empresa', max: 30 }))
        console.log('0168: campo empresa criado')
      } catch (e3) {
        console.log('0168: falhou empresa -> ' + String(e3).slice(0, 120))
      }
    }
    if (nomes.indexOf('empresas') < 0) {
      try {
        col.fields.add(new JSONField({ name: 'empresas' }))
        console.log('0168: campo empresas criado')
      } catch (e4) {}
    }
    try {
      app.save(col)
    } catch (e5) {}

    // preenche
    var regs = []
    try {
      regs = app.findRecordsByFilter('access_grants', '', '', 5000, 0)
    } catch (e6) {}
    var antes = regs.length
    var preenchidos = 0
    for (const g of regs) {
      var atual = ''
      try {
        atual = String(g.get('empresa') || '')
      } catch (e7) {}
      if (atual !== '') {
        preenchidos++
        continue
      }
      try {
        g.set('empresa', idHaisan)
        app.save(g)
        preenchidos++
      } catch (e8) {}
    }
    console.log('0168: grants antes=' + antes + ' preenchidos=' + preenchidos)
  },
  (app) => {
    console.log('0168 revertida (campos permanecem)')
  },
)
