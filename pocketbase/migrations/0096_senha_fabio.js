/// <reference path="../pb_data/types.d.ts" />
/**
 * Migração 0096 — devolve a senha provisória do Fábio (30/10).
 *
 * A senha dele foi alterada durante a PROVA da tela Minha senha
 * (`NovaFabio2026`). O Fábio não sabe dessa senha e vai receber a
 * provisória como os demais, trocando na tela quando entrar.
 */

migrate(
  (app) => {
    var u = null
    try {
      u = app.findAuthRecordByEmail('users', 'fabio@haisan.com.br')
    } catch (e1) {
      console.log('0096: usuario nao encontrado')
      return
    }
    try {
      u.setPassword('Haisan@2026')
      app.save(u)
      console.log('0096: senha do Fabio devolvida para a provisoria')
    } catch (e2) {
      console.log('0096: falhou -> ' + String(e2).slice(0, 160))
    }
  },
  (app) => {
    console.log('0096 revertida')
  },
)
