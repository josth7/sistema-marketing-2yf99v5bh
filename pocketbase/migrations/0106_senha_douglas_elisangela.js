/// <reference path="../pb_data/types.d.ts" />
// ===================================================================
// MIG 0106 — SENHA DO DOUGLAS E DA ELISANGELA (03/11).
//
// DESCOBERTA: hoje, ao testar o login dos 4 vendedores, 2 falharam —
// Douglas e Elisangela ("Failed to authenticate"). O Fábio e a Adriana
// entraram normalmente.
//
// CAUSA: as migrações 0086 (Douglas) e 0087 (Elisangela) usaram
// `set('password', 'Haisan@2026')`. Num registro de `users`, `set` apenas
// grava o texto no campo — NÃO faz o hash. O PocketBase valida com hash, então
// a senha nunca vale. O método certo é `setPassword(...)`.
//
// Isso é a MESMA lição da 0091 (senha da Anezia), registrada no comentário
// daquele arquivo. A 0091 acertou; a 0086/0087 não.
//
// Consequência prática: dois vendedores tinham carteira de leads (418 e 419)
// e conversas atribuídas, e NÃO conseguiam entrar no sistema. Ninguém notou
// porque o login deles não era testado.
//
// Esta migração define a senha provisória com `setPassword`. Idempotente.
// ===================================================================
migrate(
  (app) => {
    const colU = app.findCollectionByNameOrId('users')
    const SENHA = 'Haisan@2026'
    const ALVOS = ['douglasrenato@haisan.com.br', 'elisangela@haisan.com.br']

    var ajustados = 0
    for (const email of ALVOS) {
      var achou = []
      try {
        achou = app.findRecordsByFilter(colU, "email='" + email + "'", '', 1, 0)
      } catch (e0) {
        console.log('0106: erro ao buscar ' + email + ': ' + e0)
        continue
      }
      if (!achou || achou.length === 0) {
        console.log('0106: usuario nao encontrado: ' + email)
        continue
      }
      const u = achou[0]
      try {
        // setPassword faz o hash; set('password') nao
        u.setPassword(SENHA)
        app.save(u)
        ajustados++
        console.log('0106: senha definida para ' + email)
      } catch (e1) {
        console.log('0106: falha ao definir senha de ' + email + ': ' + e1)
      }
    }
    console.log('0106 RESULTADO: ' + ajustados + ' senha(s) definida(s) com setPassword')
  },
  (app) => {
    // reversivel: nao ha o que desfazer (a senha anterior era invalida)
  },
)
