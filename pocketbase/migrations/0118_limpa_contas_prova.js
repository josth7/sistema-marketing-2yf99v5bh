/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0118 — limpeza das contas criadas na prova do cadastro (04/11).
 *
 * A prova da CA-3-36 criou `novo.fixture@` (vendedor) e `gestao.fixture@`
 * (gestão). São contas de teste: saem junto com os grants delas, para não
 * ficarem aparecendo na aba Equipe como se fossem gente de verdade.
 *
 * A massa da prova de suspensão já foi limpa pela 0117.
 */
migrate(
  (app) => {
    const colU = app.findCollectionByNameOrId('users')
    const colG = app.findCollectionByNameOrId('access_grants')
    const contas = ['novo.fixture@haisan.com.br', 'gestao.fixture@haisan.com.br']

    var apagadas = 0
    var grants = 0
    for (const em of contas) {
      var pessoa = null
      try {
        const a = app.findRecordsByFilter(colU, "email='" + em + "'", '', 1, 0)
        if (a && a.length > 0) pessoa = a[0]
      } catch (e0) {}
      if (!pessoa) continue
      try {
        const gs = app.findRecordsByFilter(colG, "user_id='" + pessoa.id + "'", '', 50, 0)
        for (const g of gs) {
          try {
            app.delete(g)
            grants++
          } catch (eG) {}
        }
      } catch (e1) {}
      try {
        app.delete(pessoa)
        apagadas++
      } catch (e2) {
        console.log('0118: nao apaguei ' + em + ' -> ' + String(e2).slice(0, 160))
      }
    }
    console.log('0118: contas de teste removidas=' + apagadas + ' grants=' + grants)
  },
  (app) => {
    console.log('0118 revertida')
  },
)
