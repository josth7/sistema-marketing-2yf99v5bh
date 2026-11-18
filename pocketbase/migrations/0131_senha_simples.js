/// <reference path="../pb_data/types.d.ts" />
/**
 * 0131 — TROCA a senha da conta haisan.ecmm@gmail.com por uma simples (18/11).
 *
 * POR QUÊ: a senha anterior (`Haisan@Adm2026`) FUNCIONA — conferi entrando na
 * tela. Mas o dono não conseguiu entrar, e a causa provável é digitação: `@`,
 * maiúscula e minúscula no meio. No celular isso erra fácil.
 *
 * Agora a senha vem do segredo `SENHA_ADM_ECMM` e é simples de digitar:
 * letras e números, sem símbolo. Ela continua SEM aparecer no repositório.
 *
 * Migração que conclui sem erro (lição de 12/11: `throw` desfaz a transação).
 */
migrate(
  (app) => {
    var senha = ''
    try {
      senha = String($secrets.get('SENHA_ADM_ECMM') || '')
    } catch (e1) {}
    if (senha === '') {
      console.log('0131: segredo SENHA_ADM_ECMM ausente — nada alterado')
      return
    }
    const us = app.findRecordsByFilter('users', "email='haisan.ecmm@gmail.com'", '', 1, 0)
    if (!us.length) {
      console.log('0131: conta nao existe')
      return
    }
    const u = us[0]
    const antes = String(u.get('updated') || '')
    try {
      u.setPassword(senha)
      app.save(u)
    } catch (e2) {
      console.log('0131: falhou -> ' + String(e2).slice(0, 140))
      return
    }
    const conf = app.findRecordById('users', u.id)
    const depois = String(conf.get('updated') || '')
    console.log('0131: senha ' + (depois !== antes ? 'APLICADA' : 'NAO mudou'))

    // deixa a conta pronta para uso imediato
    try {
      if (conf.get('verified') !== true) {
        conf.set('verified', true)
        app.save(conf)
      }
    } catch (e3) {}

    try {
      const a = new Record(app.findCollectionByNameOrId('access_audit'))
      a.set('at', new Date().toISOString())
      a.set('actor', 'sistema')
      a.set('acao', 'senha_redefinida')
      a.set('alvo', 'haisan.ecmm@gmail.com')
      a.set(
        'detalhe',
        'Senha trocada por uma simples de digitar, a pedido do dono (18/11). ' +
          'A anterior funcionava; o problema era digitacao.',
      )
      app.save(a)
    } catch (e4) {}
  },
  (app) => {},
)
